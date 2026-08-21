import 'server-only';

import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { smtpEmailGateway } from '@/lib/integrations/email/smtpEmailGateway';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { businessRepository } from '@/repositories/businessRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { notificationRepository } from '@/repositories/notificationRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { renderTemplate, assertRequiredParams } from '@/lib/notifications/renderTemplate';
import type { WhatsAppGateway, EmailGateway, SmsGateway } from '@/lib/integrations/types';
import type { TextSmsDeliveryReport } from '@/lib/integrations/sms/parseTextSmsDlr';
import type { NotificationChannel, NotificationRecipientType, OutboundMessage } from '@/types';

export class TemplateNotFoundError extends Error {
  constructor(templateCode: string, channel: NotificationChannel) {
    super(`No active "${channel}" template found for code "${templateCode}"`);
    this.name = 'TemplateNotFoundError';
  }
}

const DEFAULT_RETRY_CEILING = 5;

export interface SendNotificationInput {
  channel: NotificationChannel;
  templateCode: string;
  recipientType: NotificationRecipientType;
  recipientId: string;
  /** Phone number / email address, depending on `channel` — ignored for `in_app`. */
  recipientRef: string;
  params: Record<string, string>;
  /** Caller-supplied idempotency key (e.g. `orderId` or `orderId:eventKind`) — see `outboundMessageRepository.create`'s doc comment for how this becomes the dedup document id. */
  dedupeKey: string;
  /** Also write a `notifications` in-app feed entry alongside the channel dispatch. */
  createInApp?: boolean;
}

/**
 * Real multi-channel dispatch (§ Notification breadth,
 * PLATFORM_ARCHITECTURE_V2.md §10/§13) — `send()` renders a catalog
 * template, dedupes via `outboundMessageRepository.create`'s atomic
 * document-identity trick, and dispatches over WhatsApp/email/SMS/
 * in-app. `retrySweep()` re-attempts real `'failed'` dispatches under
 * a retry ceiling, resending the originally-rendered content rather
 * than re-rendering (see `OutboundMessage.renderedBody`'s comment).
 *
 * Deliberately still scoped to *sending*, not *triggering*: no event
 * consumer here calls `send()` automatically when e.g. an order is
 * placed or a payment fails. `publishEvent()`'s own doc comment
 * already defers "a real subscriber list" to future §19/§20 Cloud
 * Functions work — wiring that up is that work, not this one. This
 * pass delivers the real channels, the real per-event template
 * catalog, and the real retry infrastructure those future consumers
 * will call into; `notifyAdmin` (the one caller that exists today)
 * keeps working unchanged.
 */
class NotificationService {
  constructor(
    private readonly whatsapp: WhatsAppGateway = whatchimpGateway,
    private readonly email: EmailGateway = smtpEmailGateway,
    private readonly sms: SmsGateway = textSmsGateway,
  ) {}

  async notifyAdmin(businessId: string, text: string): Promise<void> {
    const business = await businessRepository.findById(businessId);
    if (!business?.adminWhatsappPhone) {
      // No admin number configured for this tenant — don't fail the order over it.
      return;
    }
    await this.whatsapp.sendMessage({ businessId, phone: business.adminWhatsappPhone, text });
  }

  async send(businessId: string, input: SendNotificationInput): Promise<void> {
    const template = await notificationTemplateRepository.findByCode(input.templateCode);
    if (!template || !template.isActive || template.channel !== input.channel) {
      throw new TemplateNotFoundError(input.templateCode, input.channel);
    }
    assertRequiredParams(input.templateCode, template.requiredParams, input.params);

    const renderedBody = renderTemplate(template.bodyTemplate, input.params);
    const renderedSubject = template.subject ? renderTemplate(template.subject, input.params) : null;
    const renderedHtmlBody = template.htmlBodyTemplate ? renderTemplate(template.htmlBodyTemplate, input.params) : null;

    const outboundId = `${input.channel}:${input.dedupeKey}`;
    const { created } = await outboundMessageRepository.create(outboundId, {
      businessId,
      notificationId: null,
      channel: input.channel,
      templateCode: input.templateCode,
      recipientRef: input.recipientRef,
      renderedSubject,
      renderedBody,
      renderedHtmlBody,
      providerMessageId: null,
      status: 'queued',
      failureReason: null,
      sentAt: null,
      deliveredAt: null,
      retryCount: 0,
    });
    if (!created) {
      // Same dedupeKey already dispatched (or is in flight) — never send twice for one logical notification.
      return;
    }

    if (input.createInApp) {
      const notificationId = await notificationRepository.create({
        businessId,
        recipientId: input.recipientId,
        recipientType: input.recipientType,
        channel: input.channel,
        templateCode: input.templateCode,
        payload: input.params,
      });
      if (input.channel === 'in_app') {
        await outboundMessageRepository.markSent(outboundId, `in_app:${notificationId}`);
        return;
      }
    }

    await this.dispatch(businessId, outboundId, input.channel, input.recipientRef, renderedSubject, renderedBody, renderedHtmlBody);
  }

  /** § Admin: Creators — every real email/SMS ever dispatched to one person, newest first. See `outboundMessageRepository.listByRecipient()` for how `recipientRefs` is used. */
  async listMessagesForRecipient(
    businessId: string,
    recipientRefs: string[],
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ messages: { id: string; data: OutboundMessage }[]; nextCursor: string | null }> {
    return outboundMessageRepository.listByRecipient(businessId, recipientRefs, options);
  }

  /**
   * Applies one TextSMS delivery report to the dispatch log
   * (§ TextSMS delivery reports). Returns what it did so the webhook
   * route can record the outcome on the `webhookEvents` ledger without
   * reaching into the repository itself.
   *
   * `'pending'` covers both a genuinely in-flight status (submitted,
   * buffered) and a status the parser did not recognise — in both cases
   * the right move is identical: leave the record alone. See
   * `parseTextSmsDlr`'s header for why an unrecognised status resolves
   * that way rather than being guessed at.
   */
  async applySmsDeliveryReport(
    businessId: string,
    report: TextSmsDeliveryReport,
  ): Promise<{ outcome: 'delivered' | 'bounced' | 'ignored'; outboundMessageId: string | null }> {
    const match = await outboundMessageRepository.findByProviderMessageId(businessId, report.providerMessageId);
    if (!match) {
      return { outcome: 'ignored', outboundMessageId: null };
    }

    if (report.outcome === 'delivered') {
      await outboundMessageRepository.markDelivered(match.id);
      return { outcome: 'delivered', outboundMessageId: match.id };
    }

    if (report.outcome === 'failed') {
      // The provider's own words, so a bounce reason in Admin says what
      // the network actually reported rather than our paraphrase of it.
      const reason = report.description ?? report.rawStatus ?? 'undelivered';
      await outboundMessageRepository.markBounced(match.id, `TextSMS delivery report: ${reason}`);
      return { outcome: 'bounced', outboundMessageId: match.id };
    }

    return { outcome: 'ignored', outboundMessageId: match.id };
  }

  async retrySweep(businessId: string, retryCeiling = DEFAULT_RETRY_CEILING): Promise<{ attempted: number }> {
    const retryable = await outboundMessageRepository.listRetryable(businessId, retryCeiling);

    for (const { id, data } of retryable) {
      await outboundMessageRepository.incrementRetryCount(id);
      await this.dispatch(businessId, id, data.channel, data.recipientRef, data.renderedSubject, data.renderedBody, data.renderedHtmlBody);
    }

    return { attempted: retryable.length };
  }

  private async dispatch(
    businessId: string,
    outboundId: string,
    channel: NotificationChannel,
    recipientRef: string,
    subject: string | null,
    body: string,
    htmlBody: string | null,
  ): Promise<void> {
    try {
      const result = await this.sendViaChannel(businessId, channel, recipientRef, subject, body, htmlBody);
      await outboundMessageRepository.markSent(outboundId, result.providerMessageId);
    } catch (error) {
      await outboundMessageRepository.markFailed(
        outboundId,
        error instanceof Error ? error.message : 'Unknown dispatch failure',
      );
    }
  }

  private async sendViaChannel(
    businessId: string,
    channel: NotificationChannel,
    recipientRef: string,
    subject: string | null,
    body: string,
    htmlBody: string | null,
  ): Promise<{ providerMessageId: string }> {
    switch (channel) {
      case 'whatsapp':
        return this.whatsapp.sendMessage({ businessId, phone: recipientRef, text: body });
      case 'email':
        return this.email.send({ businessId, to: recipientRef, subject: subject ?? '', body, html: htmlBody ?? undefined });
      case 'sms':
        return this.sms.send({ businessId, to: recipientRef, body });
      case 'in_app':
        throw new Error('in_app is not a dispatchable channel');
    }
  }
}

export const notificationService = new NotificationService();
export { NotificationService };

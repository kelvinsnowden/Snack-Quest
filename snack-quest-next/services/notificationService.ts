import 'server-only';

import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { smtpEmailGateway } from '@/lib/integrations/email/smtpEmailGateway';
import { africasTalkingGateway } from '@/lib/integrations/sms/africasTalkingGateway';
import { businessRepository } from '@/repositories/businessRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { notificationRepository } from '@/repositories/notificationRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { renderTemplate, assertRequiredParams } from '@/lib/notifications/renderTemplate';
import type { WhatsAppGateway, EmailGateway, SmsGateway } from '@/lib/integrations/types';
import type { NotificationChannel, NotificationRecipientType } from '@/types';

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
    private readonly sms: SmsGateway = africasTalkingGateway,
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

    const outboundId = `${input.channel}:${input.dedupeKey}`;
    const { created } = await outboundMessageRepository.create(outboundId, {
      businessId,
      notificationId: null,
      channel: input.channel,
      templateCode: input.templateCode,
      recipientRef: input.recipientRef,
      renderedSubject,
      renderedBody,
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

    await this.dispatch(businessId, outboundId, input.channel, input.recipientRef, renderedSubject, renderedBody);
  }

  async retrySweep(businessId: string, retryCeiling = DEFAULT_RETRY_CEILING): Promise<{ attempted: number }> {
    const retryable = await outboundMessageRepository.listRetryable(businessId, retryCeiling);

    for (const { id, data } of retryable) {
      await outboundMessageRepository.incrementRetryCount(id);
      await this.dispatch(businessId, id, data.channel, data.recipientRef, data.renderedSubject, data.renderedBody);
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
  ): Promise<void> {
    try {
      const result = await this.sendViaChannel(businessId, channel, recipientRef, subject, body);
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
  ): Promise<{ providerMessageId: string }> {
    switch (channel) {
      case 'whatsapp':
        return this.whatsapp.sendMessage({ businessId, phone: recipientRef, text: body });
      case 'email':
        return this.email.send({ businessId, to: recipientRef, subject: subject ?? '', body });
      case 'sms':
        return this.sms.send({ to: recipientRef, body });
      case 'in_app':
        throw new Error('in_app is not a dispatchable channel');
    }
  }
}

export const notificationService = new NotificationService();
export { NotificationService };

import 'server-only';

import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { brandedEmailHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';
import type { NotificationTemplate } from '@/types';

/**
 * Owns editing the real, live `notificationTemplates` catalog (§
 * Admin: Notification Templates) — the content that fires for the
 * events already wired into `notificationService.send()` (creator
 * welcome, creator approved, commission earned, withdrawal approved,
 * staff invited, and the SMS-only catalog alongside them). This is
 * deliberately content editing, not event routing: which
 * `templateCode` fires for which business event stays a fixed call
 * site in each domain Service (e.g. `creatorAuthService.register()`
 * always sends `creator_registered_welcome_email`) — there is no
 * concept in this codebase of more than one template competing for
 * the same event, so there's nothing to "pick" beyond what this edits.
 * `isActive` is the one real on/off switch: every call site already
 * wraps `notificationService.send()` in a try/catch that swallows a
 * `TemplateNotFoundError` (an inactive template throws one), so
 * toggling a template off silently skips that event's email without
 * touching the business flow it's attached to.
 *
 * For `channel === 'email'` templates, `heading`/`bodyTemplate`/
 * `ctaLabel`/`ctaUrl` are the source of truth and `htmlBodyTemplate`
 * is always re-derived from them via `brandedEmailHtml()` on save —
 * the same shell (logo included) Marketing Emails renders through, so
 * a transactional email and a marketing email never drift apart
 * visually. Every other channel only has `bodyTemplate` to edit.
 */

export class NotificationTemplateNotFoundError extends Error {
  constructor(templateCode: string) {
    super(`No notification template found for code "${templateCode}"`);
    this.name = 'NotificationTemplateNotFoundError';
  }
}

export class NotificationTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationTemplateValidationError';
  }
}

export interface NotificationTemplateUpdateInput {
  subject: string | null;
  heading: string | null;
  bodyTemplate: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  isActive: boolean;
}

function validate(existing: NotificationTemplate, input: NotificationTemplateUpdateInput): void {
  if (!input.bodyTemplate.trim()) {
    throw new NotificationTemplateValidationError('"bodyTemplate" is required.');
  }
  if (Boolean(input.ctaLabel?.trim()) !== Boolean(input.ctaUrl?.trim())) {
    throw new NotificationTemplateValidationError('A CTA button needs both a label and a URL, or neither.');
  }
  if (existing.channel === 'email') {
    if (!input.subject?.trim()) {
      throw new NotificationTemplateValidationError('"subject" is required for an email template.');
    }
    if (!input.heading?.trim()) {
      throw new NotificationTemplateValidationError('"heading" is required for an email template.');
    }
  }
}

export interface TemplateDeliveryStats {
  templateCode: string;
  sent: number;
  failed: number;
  pending: number;
  /** `null` when this template has never actually been dispatched — distinct from a real `0%`, so the UI can say "never sent" instead of implying every attempt failed. */
  successRate: number | null;
}

class NotificationTemplateService {
  async listAll(): Promise<NotificationTemplate[]> {
    const templates = await notificationTemplateRepository.listAll();
    return templates.sort((a, b) => a.templateCode.localeCompare(b.templateCode));
  }

  /**
   * Real sent/failed/pending counts per template (§ Admin: Notification
   * Templates) — "otherwise I won't know when something fails" is
   * exactly what this answers: a super admin can see, at a glance,
   * which of these events are actually delivering and which are
   * silently failing, without having to go hunting through Firestore.
   */
  async getDeliveryStats(businessId: string): Promise<TemplateDeliveryStats[]> {
    const templates = await notificationTemplateRepository.listAll();
    const stats = await Promise.all(
      templates.map((template) => outboundMessageRepository.getTemplateStats(businessId, template.templateCode)),
    );

    return templates
      .map((template, index) => {
        const { sent, failed, pending } = stats[index];
        const attempted = sent + failed;
        return {
          templateCode: template.templateCode,
          sent,
          failed,
          pending,
          successRate: attempted > 0 ? Math.round((sent / attempted) * 100) : null,
        };
      })
      .sort((a, b) => a.templateCode.localeCompare(b.templateCode));
  }

  async getByCode(templateCode: string): Promise<NotificationTemplate> {
    const template = await notificationTemplateRepository.findByCode(templateCode);
    if (!template) {
      throw new NotificationTemplateNotFoundError(templateCode);
    }
    return template;
  }

  /**
   * Re-renders `htmlBodyTemplate` from the structured fields for an
   * email template (skipped entirely for every other channel, which
   * has no HTML alternative to begin with) and bumps `version` — the
   * catalog's own "versioned copy" convention (`types/notification.ts`).
   */
  async updateTemplate(templateCode: string, input: NotificationTemplateUpdateInput): Promise<void> {
    const existing = await this.getByCode(templateCode);
    validate(existing, input);

    const ctaLabel = input.ctaLabel?.trim() || null;
    const ctaUrl = input.ctaUrl?.trim() || null;
    const bodyTemplate = input.bodyTemplate.trim();

    const htmlBodyTemplate =
      existing.channel === 'email'
        ? brandedEmailHtml({
            heading: (input.heading ?? '').trim(),
            bodyHtml: paragraphsToHtml(bodyTemplate),
            ctaLabel,
            ctaUrl,
          })
        : null;

    await notificationTemplateRepository.update(templateCode, {
      subject: existing.channel === 'email' ? input.subject?.trim() || null : null,
      heading: existing.channel === 'email' ? (input.heading ?? '').trim() || null : null,
      bodyTemplate,
      ctaLabel,
      ctaUrl,
      htmlBodyTemplate,
      isActive: input.isActive,
      version: existing.version + 1,
    });
  }
}

export const notificationTemplateService = new NotificationTemplateService();
export { NotificationTemplateService };

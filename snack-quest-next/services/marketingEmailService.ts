import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import {
  marketingEmailRepository,
  type MarketingEmailCampaignInput,
} from '@/repositories/marketingEmailRepository';
import { smtpEmailGateway } from '@/lib/integrations/email/smtpEmailGateway';
import { brandedEmailHtml, paragraphsToHtml } from '@/lib/notifications/brandedEmailHtml';
import type { CreatorStatus, MarketingEmailCampaign, MarketingEmailSegment } from '@/types';

/**
 * Owns staff-composed branded email blasts (§ Admin: Marketing
 * Emails) — segment resolution, the branded render, and the actual
 * per-recipient send loop. Deliberately bypasses `NotificationService`:
 * that service requires a pre-seeded `notificationTemplates` doc and
 * is single-recipient/idempotent-by-dedupeKey, neither of which fits
 * ad-hoc staff-authored content sent to many recipients in one go.
 * Calls `smtpEmailGateway` directly per recipient instead — that
 * gateway already wraps itself in a circuit breaker, so a failing SMTP
 * server trips and fails the rest of a send fast rather than each
 * recipient hitting its own slow timeout.
 *
 * There is deliberately no customer segment: `OrderCustomer` never
 * captures an email address anywhere in this codebase (checkout only
 * collects phone + name + county) — see `MarketingEmailSegment`'s own
 * doc comment. Only creators (real Firebase Auth accounts, real
 * emails) and a hand-pasted custom list are real, sendable segments.
 */

export class MarketingEmailValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingEmailValidationError';
  }
}

export class MarketingEmailNotFoundError extends Error {
  constructor(campaignId: string) {
    super(`No marketing email campaign found for id ${campaignId}`);
    this.name = 'MarketingEmailNotFoundError';
  }
}

export class MarketingEmailNotEditableError extends Error {
  constructor(status: string) {
    super(`This campaign is '${status}' — only a draft can be edited, deleted, or sent.`);
    this.name = 'MarketingEmailNotEditableError';
  }
}

export interface MarketingEmailDraftInput {
  subject: string;
  preheader: string | null;
  heading: string;
  bodyText: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  segment: MarketingEmailSegment;
  customRecipients: string[] | null;
}

export interface MarketingEmailSendResult {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

/** A hard ceiling on one send — matches the codebase's existing bounded-scan discipline (e.g. `customerService`'s `AGGREGATION_LIMIT`) rather than an unbounded scan of every creator ever registered. */
const RECIPIENT_SCAN_LIMIT = 2000;
const MAX_CUSTOM_RECIPIENTS = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SEGMENTS: MarketingEmailSegment[] = ['all_creators', 'active_creators', 'pending_creators', 'suspended_creators', 'custom'];

const SEGMENT_STATUS: Partial<Record<MarketingEmailSegment, CreatorStatus>> = {
  active_creators: 'active',
  pending_creators: 'pending',
  suspended_creators: 'suspended',
};

function normalizeCustomRecipients(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (!email || !EMAIL_PATTERN.test(email) || seen.has(email)) {
      continue;
    }
    seen.add(email);
    out.push(email);
    if (out.length >= MAX_CUSTOM_RECIPIENTS) {
      break;
    }
  }
  return out;
}

function validateDraft(input: MarketingEmailDraftInput): void {
  if (!input.subject.trim()) {
    throw new MarketingEmailValidationError('"subject" is required.');
  }
  if (!input.heading.trim()) {
    throw new MarketingEmailValidationError('"heading" is required.');
  }
  if (!input.bodyText.trim()) {
    throw new MarketingEmailValidationError('"bodyText" is required.');
  }
  if (!SEGMENTS.includes(input.segment)) {
    throw new MarketingEmailValidationError(`"segment" must be one of: ${SEGMENTS.join(', ')}.`);
  }
  if (input.segment === 'custom' && normalizeCustomRecipients(input.customRecipients ?? []).length === 0) {
    throw new MarketingEmailValidationError('A custom segment needs at least one valid recipient email.');
  }
  if (Boolean(input.ctaLabel?.trim()) !== Boolean(input.ctaUrl?.trim())) {
    throw new MarketingEmailValidationError('A CTA button needs both a label and a URL, or neither.');
  }
}

/** The plain-text alternative sent alongside the branded HTML — every real email client falls back to this when it can't (or won't) render HTML. */
function plainTextBody(campaign: Pick<MarketingEmailCampaign, 'heading' | 'bodyText' | 'ctaLabel' | 'ctaUrl'>): string {
  const parts = [campaign.heading, '', campaign.bodyText.trim()];
  if (campaign.ctaLabel && campaign.ctaUrl) {
    parts.push('', `${campaign.ctaLabel}: ${campaign.ctaUrl}`);
  }
  parts.push('', '- Snack Quest');
  return parts.join('\n');
}

class MarketingEmailService {
  /** Real, deduped recipient emails for a segment — creators only (see this module's own doc comment for why). Bounded by `RECIPIENT_SCAN_LIMIT`. */
  async resolveRecipients(
    businessId: string,
    segment: MarketingEmailSegment,
    customRecipients: string[] | null,
  ): Promise<string[]> {
    if (segment === 'custom') {
      return normalizeCustomRecipients(customRecipients ?? []);
    }

    const status = SEGMENT_STATUS[segment];
    const emails = new Set<string>();
    let cursor: string | undefined;

    while (emails.size < RECIPIENT_SCAN_LIMIT) {
      const { creators, nextCursor } = await creatorRepository.listByBusiness(businessId, {
        status,
        cursor,
        limit: 100,
      });
      if (creators.length === 0) {
        break;
      }
      const users = await Promise.all(creators.map((c) => userRepository.findById(c.id)));
      for (const user of users) {
        if (user?.email) {
          emails.add(user.email.toLowerCase());
        }
      }
      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    return Array.from(emails).slice(0, RECIPIENT_SCAN_LIMIT);
  }

  async previewRecipientCount(
    businessId: string,
    segment: MarketingEmailSegment,
    customRecipients: string[] | null,
  ): Promise<number> {
    const recipients = await this.resolveRecipients(businessId, segment, customRecipients);
    return recipients.length;
  }

  async createDraft(businessId: string, input: MarketingEmailDraftInput, actor: string): Promise<string> {
    validateDraft(input);
    const data: MarketingEmailCampaignInput = {
      businessId,
      subject: input.subject.trim(),
      preheader: input.preheader?.trim() || null,
      heading: input.heading.trim(),
      bodyText: input.bodyText.trim(),
      imageUrl: input.imageUrl,
      ctaLabel: input.ctaLabel?.trim() || null,
      ctaUrl: input.ctaUrl?.trim() || null,
      segment: input.segment,
      customRecipients: input.segment === 'custom' ? normalizeCustomRecipients(input.customRecipients ?? []) : null,
      status: 'draft',
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      sentAt: null,
    };
    return marketingEmailRepository.create(data, actor);
  }

  async updateDraft(
    businessId: string,
    campaignId: string,
    input: MarketingEmailDraftInput,
    actor: string,
  ): Promise<void> {
    const existing = await this.requireOwned(businessId, campaignId);
    if (existing.status !== 'draft') {
      throw new MarketingEmailNotEditableError(existing.status);
    }
    validateDraft(input);
    await marketingEmailRepository.update(campaignId, {
      subject: input.subject.trim(),
      preheader: input.preheader?.trim() || null,
      heading: input.heading.trim(),
      bodyText: input.bodyText.trim(),
      imageUrl: input.imageUrl,
      ctaLabel: input.ctaLabel?.trim() || null,
      ctaUrl: input.ctaUrl?.trim() || null,
      segment: input.segment,
      customRecipients: input.segment === 'custom' ? normalizeCustomRecipients(input.customRecipients ?? []) : null,
      updatedBy: actor,
    });
  }

  async deleteDraft(businessId: string, campaignId: string): Promise<void> {
    const existing = await this.requireOwned(businessId, campaignId);
    if (existing.status !== 'draft') {
      throw new MarketingEmailNotEditableError(existing.status);
    }
    await marketingEmailRepository.delete(campaignId);
  }

  async getCampaign(businessId: string, campaignId: string): Promise<MarketingEmailCampaign> {
    return this.requireOwned(businessId, campaignId);
  }

  async listCampaigns(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ campaigns: { id: string; data: MarketingEmailCampaign }[]; nextCursor: string | null }> {
    return marketingEmailRepository.listByBusiness(businessId, options);
  }

  /**
   * Real send — resolves the segment, renders the branded shell once,
   * then dials `smtpEmailGateway` once per recipient. Best-effort per
   * recipient (one failure doesn't stop the rest); the final tally is
   * what the campaign's `status` and counts reflect, not an all-or-
   * nothing outcome.
   */
  async send(businessId: string, campaignId: string, actor: string): Promise<MarketingEmailSendResult> {
    const campaign = await this.requireOwned(businessId, campaignId);
    if (campaign.status !== 'draft') {
      throw new MarketingEmailNotEditableError(campaign.status);
    }

    const recipients = await this.resolveRecipients(businessId, campaign.segment, campaign.customRecipients);
    if (recipients.length === 0) {
      throw new MarketingEmailValidationError('No recipients resolved for this segment — nothing was sent.');
    }

    await marketingEmailRepository.update(campaignId, {
      status: 'sending',
      recipientCount: recipients.length,
      updatedBy: actor,
    });

    const html = brandedEmailHtml({
      heading: campaign.heading,
      bodyHtml: paragraphsToHtml(campaign.bodyText),
      imageUrl: campaign.imageUrl,
      ctaLabel: campaign.ctaLabel,
      ctaUrl: campaign.ctaUrl,
    });
    const text = plainTextBody(campaign);

    let sentCount = 0;
    let failedCount = 0;
    for (const to of recipients) {
      try {
        await smtpEmailGateway.send({ businessId, to, subject: campaign.subject, body: text, html });
        sentCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    await marketingEmailRepository.update(campaignId, {
      status: sentCount > 0 ? 'sent' : 'failed',
      sentCount,
      failedCount,
      sentAt: FieldValue.serverTimestamp() as unknown as MarketingEmailCampaign['sentAt'],
      updatedBy: actor,
    });

    return { recipientCount: recipients.length, sentCount, failedCount };
  }

  private async requireOwned(businessId: string, campaignId: string): Promise<MarketingEmailCampaign> {
    const campaign = await marketingEmailRepository.findById(campaignId);
    if (!campaign || campaign.businessId !== businessId) {
      throw new MarketingEmailNotFoundError(campaignId);
    }
    return campaign;
  }
}

export const marketingEmailService = new MarketingEmailService();
export { MarketingEmailService };

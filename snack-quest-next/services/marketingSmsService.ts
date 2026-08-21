import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { marketingSmsRepository } from '@/repositories/marketingSmsRepository';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { customerService } from '@/services/customerService';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { buildOptOutUrl, optOutSuffix, SmsOptOutSecretMissingError } from '@/lib/sms/optOutLink';
import { calculateSmsCost } from '@/lib/sms/segments';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { toMillis } from '@/lib/firestoreTimestamp';
import type { SmsGateway } from '@/lib/integrations/types';
import type { MarketingSmsCampaign, MarketingSmsFailedRecipient, MarketingSmsSegment } from '@/types';
// `CustomerSummary` lives on the Service, not in `@/types` — customers
// are an aggregation over orders rather than a stored collection, so
// there is no document type for them (see `CustomerService`).
import type { CustomerSummary } from '@/services/customerService';
import {
  HIGH_VALUE_CUSTOMER_THRESHOLD_KES,
  LAPSED_CUSTOMER_DAYS,
  RECENT_CUSTOMER_DAYS,
} from '@/types/marketingSms';

export class MarketingSmsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingSmsValidationError';
  }
}

export class MarketingSmsNotFoundError extends Error {
  constructor(campaignId: string) {
    super(`Marketing SMS campaign ${campaignId} not found`);
    this.name = 'MarketingSmsNotFoundError';
  }
}

export class MarketingSmsNotEditableError extends Error {
  constructor(status: string) {
    super(`A campaign that is already "${status}" cannot be edited or sent again.`);
    this.name = 'MarketingSmsNotEditableError';
  }
}

const MAX_BODY_LENGTH = 480;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MarketingSmsDraftInput {
  name: string;
  bodyText: string;
  segment: MarketingSmsSegment;
  customRecipients?: string[] | null;
}

export interface MarketingSmsSendResult {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  optedOutSkippedCount: number;
  totalSegmentsSent: number;
}

export interface MarketingSmsAudiencePreview {
  /** Everyone the segment matched, before the opt-out register is applied. */
  matchedCount: number;
  /** How many of those are on the opt-out register. Surfaced rather than folded into the total so the operator sees the register working. */
  optedOutCount: number;
  /** Who would actually be texted — `matchedCount - optedOutCount`. */
  recipientCount: number;
  segmentsPerMessage: number;
  totalSegments: number;
  encoding: string;
  forcedUcs2By: string | null;
}

/**
 * Staff-composed SMS blasts to customers (§ Admin: Marketing SMS).
 *
 * The structure deliberately mirrors `MarketingEmailService` — draft,
 * resolve recipients at send time, dispatch best-effort per recipient,
 * record exactly who failed and why, resend to just those. Two things
 * are genuinely different, and both are the reason this is its own
 * service rather than a channel flag on that one:
 *
 * 1. **Opt-out is not optional.** Every recipient list passes through
 *    `applyOptOuts` on its way out of `resolveRecipients`, which is the
 *    only method that produces a recipient list at all — so there is no
 *    route through this class that can text someone who asked not to be
 *    texted. The preview and the send resolve the audience the same
 *    way, so what an operator is shown is what will actually happen.
 *
 * 2. **Sending costs money per recipient.** Email is effectively free
 *    per extra person; SMS is billed per segment per recipient, which
 *    is why the audience preview reports segments and why the campaign
 *    stores what it actually cost.
 *
 * Transactional SMS deliberately does not come through here.
 * `NotificationService` sends order confirmations and dispatch notices
 * without consulting the opt-out register, because those are service
 * messages about a purchase the customer chose to make — suppressing
 * them would withhold information they need rather than respect a
 * marketing preference.
 */
class MarketingSmsService {
  constructor(private readonly sms: SmsGateway = textSmsGateway) {}

  /**
   * The audience for a segment, with opted-out numbers already removed.
   *
   * The only place a recipient list is produced. Everything that sends
   * goes through here, which is what makes the opt-out guarantee
   * structural rather than a rule someone has to remember.
   */
  async resolveRecipients(
    businessId: string,
    segment: MarketingSmsSegment,
    customRecipients: string[] | null,
  ): Promise<{ recipients: string[]; matchedCount: number; optedOutCount: number }> {
    const matched =
      segment === 'custom'
        ? normalizeCustomRecipients(customRecipients ?? [])
        : selectSegment(await customerService.listCustomers(businessId), segment).map((c) => c.phoneNumber);

    const unique = Array.from(new Set(matched));
    const optedOut = await smsOptOutRepository.listOptedOutNumbers(businessId);
    const recipients = unique.filter((phone) => !optedOut.has(phone));

    return {
      recipients,
      matchedCount: unique.length,
      optedOutCount: unique.length - recipients.length,
    };
  }

  /** What the composer shows before anyone presses send — the same resolution the send itself will do, plus what it will cost. */
  async previewAudience(
    businessId: string,
    segment: MarketingSmsSegment,
    customRecipients: string[] | null,
    bodyText: string,
  ): Promise<MarketingSmsAudiencePreview> {
    const { recipients, matchedCount, optedOutCount } = await this.resolveRecipients(
      businessId,
      segment,
      customRecipients,
    );
    // Costed with a real opt-out link attached, because that is what
    // actually goes out — a preview that priced the bare body would
    // under-report by ~42 characters and could show one segment for a
    // message that bills as two.
    const cost = calculateSmsCost(this.composeMessage(bodyText, sampleRecipient(recipients)));

    return {
      matchedCount,
      optedOutCount,
      recipientCount: recipients.length,
      segmentsPerMessage: cost.segments,
      totalSegments: cost.segments * recipients.length,
      encoding: cost.encoding,
      forcedUcs2By: cost.forcedUcs2By,
    };
  }

  async createDraft(businessId: string, input: MarketingSmsDraftInput, actor: string): Promise<string> {
    const draft = this.validateDraft(input);
    return marketingSmsRepository.create(
      {
        businessId,
        name: draft.name,
        bodyText: draft.bodyText,
        segment: draft.segment,
        customRecipients: draft.customRecipients,
        status: 'draft',
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        optedOutSkippedCount: 0,
        failedRecipients: null,
        segmentsPerMessage: 0,
        totalSegmentsSent: 0,
        sentAt: null,
      },
      actor,
    );
  }

  async updateDraft(
    businessId: string,
    campaignId: string,
    input: MarketingSmsDraftInput,
    actor: string,
  ): Promise<void> {
    const campaign = await this.requireOwned(businessId, campaignId);
    if (campaign.status !== 'draft') {
      throw new MarketingSmsNotEditableError(campaign.status);
    }
    const draft = this.validateDraft(input);
    await marketingSmsRepository.update(campaignId, {
      name: draft.name,
      bodyText: draft.bodyText,
      segment: draft.segment,
      customRecipients: draft.customRecipients,
      updatedBy: actor,
    });
  }

  async deleteDraft(businessId: string, campaignId: string): Promise<void> {
    const campaign = await this.requireOwned(businessId, campaignId);
    if (campaign.status !== 'draft') {
      throw new MarketingSmsNotEditableError(campaign.status);
    }
    await marketingSmsRepository.delete(campaignId);
  }

  async getCampaign(businessId: string, campaignId: string): Promise<MarketingSmsCampaign> {
    return this.requireOwned(businessId, campaignId);
  }

  async listCampaigns(businessId: string, options: { limit?: number; cursor?: string } = {}) {
    return marketingSmsRepository.listByBusiness(businessId, options);
  }

  async send(businessId: string, campaignId: string, actor: string): Promise<MarketingSmsSendResult> {
    const campaign = await this.requireOwned(businessId, campaignId);
    if (campaign.status !== 'draft') {
      throw new MarketingSmsNotEditableError(campaign.status);
    }

    const { recipients, optedOutCount } = await this.resolveRecipients(
      businessId,
      campaign.segment,
      campaign.customRecipients,
    );
    if (recipients.length === 0) {
      throw new MarketingSmsValidationError(
        optedOutCount > 0
          ? `Every customer in this segment (${optedOutCount}) has opted out of marketing SMS — nothing was sent.`
          : 'No customers matched this segment — nothing was sent.',
      );
    }

    // Checked before the status moves off 'draft', so a missing secret
    // leaves the campaign editable and re-sendable rather than stranded
    // mid-send. A marketing text whose opt-out link cannot be honoured
    // must never go out.
    this.assertOptOutLinkAvailable(recipients[0]);

    const segmentsPerMessage = calculateSmsCost(this.composeMessage(campaign.bodyText, recipients[0])).segments;

    await marketingSmsRepository.update(campaignId, {
      status: 'sending',
      recipientCount: recipients.length,
      optedOutSkippedCount: optedOutCount,
      segmentsPerMessage,
      updatedBy: actor,
    });

    const { sentCount, failedRecipients } = await this.dispatchToRecipients(campaign.bodyText, recipients);

    await marketingSmsRepository.update(campaignId, {
      status: sentCount > 0 ? 'sent' : 'failed',
      sentCount,
      failedCount: failedRecipients.length,
      failedRecipients: failedRecipients.length > 0 ? failedRecipients : null,
      totalSegmentsSent: segmentsPerMessage * sentCount,
      sentAt: FieldValue.serverTimestamp() as unknown as MarketingSmsCampaign['sentAt'],
      updatedBy: actor,
    });

    return {
      recipientCount: recipients.length,
      sentCount,
      failedCount: failedRecipients.length,
      optedOutSkippedCount: optedOutCount,
      totalSegmentsSent: segmentsPerMessage * sentCount,
    };
  }

  /**
   * Retries exactly the recipients a prior attempt failed for, with the
   * same body — never a re-composition, which would make this a second
   * campaign rather than a retry of the first.
   *
   * The opt-out register is consulted again rather than trusted from
   * the original send: someone who opted out in the minutes between the
   * two attempts must not be texted by the retry.
   */
  async resendFailed(businessId: string, campaignId: string, actor: string): Promise<MarketingSmsSendResult> {
    const campaign = await this.requireOwned(businessId, campaignId);
    if (campaign.status !== 'sent' && campaign.status !== 'failed') {
      throw new MarketingSmsValidationError('Only a campaign that has already sent can be resent to its failed recipients.');
    }
    const previouslyFailed = campaign.failedRecipients ?? [];
    if (previouslyFailed.length === 0) {
      throw new MarketingSmsValidationError('This campaign has no failed recipients to resend to.');
    }

    const optedOut = await smsOptOutRepository.listOptedOutNumbers(businessId);
    const recipients = previouslyFailed.map((entry) => entry.phoneNumber).filter((phone) => !optedOut.has(phone));
    const newlyOptedOut = previouslyFailed.length - recipients.length;

    if (recipients.length === 0) {
      throw new MarketingSmsValidationError(
        'Every failed recipient has since opted out of marketing SMS — nothing was resent.',
      );
    }

    const { sentCount, failedRecipients } = await this.dispatchToRecipients(campaign.bodyText, recipients);

    await marketingSmsRepository.update(campaignId, {
      status: sentCount + campaign.sentCount > 0 ? 'sent' : 'failed',
      sentCount: campaign.sentCount + sentCount,
      failedCount: failedRecipients.length,
      failedRecipients: failedRecipients.length > 0 ? failedRecipients : null,
      optedOutSkippedCount: campaign.optedOutSkippedCount + newlyOptedOut,
      totalSegmentsSent: campaign.totalSegmentsSent + campaign.segmentsPerMessage * sentCount,
      updatedBy: actor,
    });

    return {
      recipientCount: recipients.length,
      sentCount,
      failedCount: failedRecipients.length,
      optedOutSkippedCount: newlyOptedOut,
      totalSegmentsSent: campaign.segmentsPerMessage * sentCount,
    };
  }

  /**
   * The message one recipient receives: the composed body plus their
   * own signed opt-out link. Public so the composer's character count
   * and the real send are computed by the same code — a preview that
   * measured something other than what ships is worse than no preview.
   */
  composeMessage(bodyText: string, phoneNumber: string): string {
    return `${bodyText}${optOutSuffix(buildOptOutUrl(getSiteUrl(), phoneNumber))}`;
  }

  /** The one place that actually dials the gateway — best-effort per recipient, with the real error captured per recipient rather than discarded. */
  private async dispatchToRecipients(
    bodyText: string,
    recipients: string[],
  ): Promise<{ sentCount: number; failedRecipients: MarketingSmsFailedRecipient[] }> {
    let sentCount = 0;
    const failedRecipients: MarketingSmsFailedRecipient[] = [];

    for (const phoneNumber of recipients) {
      try {
        await this.sms.send({ to: phoneNumber, body: this.composeMessage(bodyText, phoneNumber) });
        sentCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`MarketingSmsService: send failed for ${phoneNumber}: ${message}`);
        failedRecipients.push({ phoneNumber, error: message });
      }
    }

    return { sentCount, failedRecipients };
  }

  private assertOptOutLinkAvailable(sampleNumber: string): void {
    try {
      buildOptOutUrl(getSiteUrl(), sampleNumber);
    } catch (error) {
      if (error instanceof SmsOptOutSecretMissingError) {
        throw new MarketingSmsValidationError(
          'SMS_OPTOUT_SECRET is not configured, so the opt-out link in this campaign could not be honoured. Nothing was sent.',
        );
      }
      throw error;
    }
  }

  private validateDraft(input: MarketingSmsDraftInput): Required<MarketingSmsDraftInput> {
    const name = (input.name ?? '').trim();
    const bodyText = (input.bodyText ?? '').trim();

    if (!name) {
      throw new MarketingSmsValidationError('Give the campaign a name so you can find it later.');
    }
    if (!bodyText) {
      throw new MarketingSmsValidationError('The message cannot be empty.');
    }
    if (bodyText.length > MAX_BODY_LENGTH) {
      throw new MarketingSmsValidationError(
        `The message is ${bodyText.length} characters. Keep it under ${MAX_BODY_LENGTH} — beyond that it costs four segments per recipient and almost nobody reads to the end.`,
      );
    }

    if (input.segment === 'custom') {
      const numbers = normalizeCustomRecipients(input.customRecipients ?? []);
      if (numbers.length === 0) {
        throw new MarketingSmsValidationError('Add at least one valid Kenyan mobile number, or pick a segment instead.');
      }
      return { name, bodyText, segment: 'custom', customRecipients: numbers };
    }

    return { name, bodyText, segment: input.segment, customRecipients: null };
  }

  private async requireOwned(businessId: string, campaignId: string): Promise<MarketingSmsCampaign> {
    const campaign = await marketingSmsRepository.findById(campaignId);
    if (!campaign || campaign.businessId !== businessId) {
      throw new MarketingSmsNotFoundError(campaignId);
    }
    return campaign;
  }
}

/**
 * Silently drops anything that is not a Kenyan mobile number rather
 * than throwing. A hand-pasted list routinely carries a stray heading
 * or a blank line, and failing the whole campaign over one is worse
 * than sending to the numbers that are real — the count the composer
 * shows back is what tells the operator something was dropped.
 */
function normalizeCustomRecipients(raw: string[]): string[] {
  const normalized: string[] = [];
  for (const entry of raw) {
    try {
      normalized.push(normalizeKenyanPhone(entry));
    } catch {
      continue;
    }
  }
  return Array.from(new Set(normalized));
}

/** Costing needs a number to build a sample link from; the link is a fixed length for every recipient, so any real one gives the right answer. The placeholder only matters for an empty audience, where the cost is academic. */
function sampleRecipient(recipients: string[]): string {
  return recipients[0] ?? '254700000000';
}

function selectSegment(customers: CustomerSummary[], segment: MarketingSmsSegment): CustomerSummary[] {
  const now = Date.now();

  switch (segment) {
    case 'all_customers':
      return customers;
    case 'recent_customers':
      return customers.filter((c) => now - toMillis(c.lastOrderAt) <= RECENT_CUSTOMER_DAYS * DAY_MS);
    case 'lapsed_customers':
      return customers.filter((c) => now - toMillis(c.lastOrderAt) >= LAPSED_CUSTOMER_DAYS * DAY_MS);
    case 'repeat_customers':
      return customers.filter((c) => c.orderCount >= 2);
    case 'one_time_customers':
      return customers.filter((c) => c.orderCount === 1);
    case 'high_value_customers':
      return customers.filter((c) => c.totalSpentKes >= HIGH_VALUE_CUSTOMER_THRESHOLD_KES);
    case 'custom':
      return [];
  }
}

export const marketingSmsService = new MarketingSmsService();
export { MarketingSmsService };

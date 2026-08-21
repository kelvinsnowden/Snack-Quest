import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { marketingSmsRepository } from '@/repositories/marketingSmsRepository';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { customerService } from '@/services/customerService';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { buildOptOutUrl, optOutSuffix, SmsOptOutSecretMissingError } from '@/lib/sms/optOutLink';
import { calculateSmsCost } from '@/lib/sms/segments';
import { firstNameOf, renderSmsBody, validateTokens } from '@/lib/marketingSms/tokens';
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

/** One person a campaign will text. Carries the name because merge tags need it, and because the phone number alone cannot produce a greeting. */
export interface SmsRecipient {
  phoneNumber: string;
  /** Null for a hand-pasted custom list, where no customer record is attached to the number. */
  customerName: string | null;
}

export interface MarketingSmsDraftInput {
  name: string;
  bodyText: string;
  segment: MarketingSmsSegment;
  customRecipients?: string[] | null;
  linkUrl?: string | null;
  offerText?: string | null;
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
  /** The worst case across recipients, since merge tags make messages different lengths. */
  segmentsPerMessage: number;
  /** The exact sum across every recipient — what the campaign will really bill. */
  totalSegments: number;
  encoding: string;
  forcedUcs2By: string | null;
  /** True when personalisation puts some recipients on more segments than others. Worth saying out loud, because it is invisible in a compose box. */
  variesByRecipient: boolean;
  /** One fully-rendered message, so the composer can show what a real person receives rather than the template. */
  sampleMessage: string;
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
 *    the register on its way out of `resolveRecipients`, which is the
 *    only method that produces a recipient list at all — so there is no
 *    route through this class that can text someone who asked not to be
 *    texted.
 *
 * 2. **Sending costs money per recipient**, and since merge tags landed,
 *    it can cost a *different* amount per recipient: "Hey Jo" and "Hey
 *    Bartholomew" are not the same length, so one campaign can bill one
 *    segment for some people and two for others. Both the preview and
 *    the stored result therefore sum real per-recipient costs rather
 *    than multiplying one figure by a head count.
 *
 * Transactional SMS deliberately does not come through here.
 * `NotificationService` sends order confirmations and dispatch notices
 * without consulting the opt-out register, because those are service
 * messages about a purchase the customer chose to make.
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
  ): Promise<{ recipients: SmsRecipient[]; matchedCount: number; optedOutCount: number }> {
    const matched: SmsRecipient[] =
      segment === 'custom'
        ? normalizeCustomRecipients(customRecipients ?? []).map((phoneNumber) => ({ phoneNumber, customerName: null }))
        : selectSegment(await customerService.listCustomers(businessId), segment).map((customer) => ({
            phoneNumber: customer.phoneNumber,
            customerName: customer.customerName,
          }));

    // Deduped by number, keeping the first — `CustomerService` already
    // aggregates one row per customer, so a duplicate here means the
    // same person reached the list twice and should be texted once.
    const seen = new Set<string>();
    const unique = matched.filter((entry) => {
      if (seen.has(entry.phoneNumber)) {
        return false;
      }
      seen.add(entry.phoneNumber);
      return true;
    });

    const optedOut = await smsOptOutRepository.listOptedOutNumbers(businessId);
    const recipients = unique.filter((entry) => !optedOut.has(entry.phoneNumber));

    return {
      recipients,
      matchedCount: unique.length,
      optedOutCount: unique.length - recipients.length,
    };
  }

  /** What the composer shows before anyone presses send — the same resolution the send itself will do, plus what it will really cost. */
  async previewAudience(
    businessId: string,
    segment: MarketingSmsSegment,
    customRecipients: string[] | null,
    bodyText: string,
    linkUrl: string | null = null,
    offerText: string | null = null,
  ): Promise<MarketingSmsAudiencePreview> {
    const tokenProblem = validateTokens({ bodyText, linkUrl, offerText });
    if (tokenProblem) {
      throw new MarketingSmsValidationError(tokenProblem);
    }

    const { recipients, matchedCount, optedOutCount } = await this.resolveRecipients(
      businessId,
      segment,
      customRecipients,
    );

    const costs = recipients.map((recipient) =>
      calculateSmsCost(this.composeMessage(bodyText, recipient, linkUrl, offerText)),
    );

    // With no audience there is still a message worth pricing, so a
    // representative one is costed rather than reporting nothing.
    const sample = costs.length > 0 ? costs : [calculateSmsCost(this.composeMessage(bodyText, SAMPLE_RECIPIENT, linkUrl, offerText))];
    const segmentCounts = sample.map((cost) => cost.segments);
    const worst = sample[segmentCounts.indexOf(Math.max(...segmentCounts))];

    return {
      matchedCount,
      optedOutCount,
      recipientCount: recipients.length,
      segmentsPerMessage: Math.max(...segmentCounts),
      totalSegments: costs.reduce((total, cost) => total + cost.segments, 0),
      encoding: worst.encoding,
      forcedUcs2By: worst.forcedUcs2By,
      variesByRecipient: new Set(segmentCounts).size > 1,
      sampleMessage: this.composeMessage(bodyText, recipients[0] ?? SAMPLE_RECIPIENT, linkUrl, offerText),
    };
  }

  async createDraft(businessId: string, input: MarketingSmsDraftInput, actor: string): Promise<string> {
    const draft = this.validateDraft(input);
    return marketingSmsRepository.create(
      {
        businessId,
        name: draft.name,
        bodyText: draft.bodyText,
        linkUrl: draft.linkUrl,
        offerText: draft.offerText,
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
      linkUrl: draft.linkUrl,
      offerText: draft.offerText,
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

    // Re-checked at send even though the draft was validated on save:
    // the campaign may have been written before a token was introduced,
    // and a literal "{{firstName}}" reaching a customer is not
    // recoverable once the aggregator has it.
    const tokenProblem = validateTokens({
      bodyText: campaign.bodyText,
      linkUrl: campaign.linkUrl,
      offerText: campaign.offerText,
    });
    if (tokenProblem) {
      throw new MarketingSmsValidationError(tokenProblem);
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

    // Both checked before the status moves off 'draft', so a
    // configuration fault leaves the campaign editable and re-sendable
    // rather than stranded mid-send.
    //
    // A marketing text whose opt-out link cannot be honoured must never
    // go out; and a gateway that cannot send to anyone should say so
    // once, here, instead of producing the same credentials error
    // separately for every recipient. A campaign to 500 people reporting
    // 500 identical failures that were all one unset environment
    // variable is a worse answer to the same question.
    this.assertOptOutLinkAvailable(recipients[0].phoneNumber);
    this.assertGatewayReady();

    await marketingSmsRepository.update(campaignId, {
      status: 'sending',
      recipientCount: recipients.length,
      optedOutSkippedCount: optedOutCount,
      updatedBy: actor,
    });

    const { sentCount, failedRecipients, segmentsSent, worstSegments } = await this.dispatchToRecipients(
      campaign,
      recipients,
    );

    await marketingSmsRepository.update(campaignId, {
      status: sentCount > 0 ? 'sent' : 'failed',
      sentCount,
      failedCount: failedRecipients.length,
      failedRecipients: failedRecipients.length > 0 ? failedRecipients : null,
      segmentsPerMessage: worstSegments,
      totalSegmentsSent: segmentsSent,
      sentAt: FieldValue.serverTimestamp() as unknown as MarketingSmsCampaign['sentAt'],
      updatedBy: actor,
    });

    return {
      recipientCount: recipients.length,
      sentCount,
      failedCount: failedRecipients.length,
      optedOutSkippedCount: optedOutCount,
      totalSegmentsSent: segmentsSent,
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
   *
   * Names are re-resolved from the current audience so the retry is
   * personalised the same way the first attempt was; a number no longer
   * in the segment falls back to the un-named greeting rather than
   * being dropped, since it was a legitimate recipient when the
   * campaign went out.
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

    const [optedOut, { recipients: current }] = await Promise.all([
      smsOptOutRepository.listOptedOutNumbers(businessId),
      this.resolveRecipients(businessId, campaign.segment, campaign.customRecipients),
    ]);
    const nameByPhone = new Map(current.map((entry) => [entry.phoneNumber, entry.customerName]));

    const recipients: SmsRecipient[] = previouslyFailed
      .filter((entry) => !optedOut.has(entry.phoneNumber))
      .map((entry) => ({ phoneNumber: entry.phoneNumber, customerName: nameByPhone.get(entry.phoneNumber) ?? null }));
    const newlyOptedOut = previouslyFailed.length - recipients.length;

    if (recipients.length === 0) {
      throw new MarketingSmsValidationError(
        'Every failed recipient has since opted out of marketing SMS — nothing was resent.',
      );
    }

    const { sentCount, failedRecipients, segmentsSent, worstSegments } = await this.dispatchToRecipients(
      campaign,
      recipients,
    );

    await marketingSmsRepository.update(campaignId, {
      status: sentCount + campaign.sentCount > 0 ? 'sent' : 'failed',
      sentCount: campaign.sentCount + sentCount,
      failedCount: failedRecipients.length,
      failedRecipients: failedRecipients.length > 0 ? failedRecipients : null,
      optedOutSkippedCount: campaign.optedOutSkippedCount + newlyOptedOut,
      segmentsPerMessage: Math.max(campaign.segmentsPerMessage, worstSegments),
      totalSegmentsSent: campaign.totalSegmentsSent + segmentsSent,
      updatedBy: actor,
    });

    return {
      recipientCount: recipients.length,
      sentCount,
      failedCount: failedRecipients.length,
      optedOutSkippedCount: newlyOptedOut,
      totalSegmentsSent: segmentsSent,
    };
  }

  /**
   * The message one recipient receives: the body with their own merge
   * tags filled in, plus their own signed opt-out link. Public so the
   * composer's character count and the real send are computed by the
   * same code — a preview that measured something other than what ships
   * is worse than no preview.
   */
  composeMessage(
    bodyText: string,
    recipient: SmsRecipient,
    linkUrl: string | null,
    offerText: string | null,
  ): string {
    const rendered = renderSmsBody(bodyText, {
      firstName: firstNameOf(recipient.customerName),
      linkUrl,
      offerText,
    });
    return `${rendered}${optOutSuffix(buildOptOutUrl(getSiteUrl(), recipient.phoneNumber))}`;
  }

  /** The one place that actually dials the gateway — best-effort per recipient, with the real error captured per recipient rather than discarded. */
  private async dispatchToRecipients(
    campaign: Pick<MarketingSmsCampaign, 'bodyText' | 'linkUrl' | 'offerText'>,
    recipients: SmsRecipient[],
  ): Promise<{
    sentCount: number;
    failedRecipients: MarketingSmsFailedRecipient[];
    segmentsSent: number;
    worstSegments: number;
  }> {
    let sentCount = 0;
    let segmentsSent = 0;
    let worstSegments = 0;
    const failedRecipients: MarketingSmsFailedRecipient[] = [];

    for (const recipient of recipients) {
      const body = this.composeMessage(campaign.bodyText, recipient, campaign.linkUrl, campaign.offerText);
      const segments = calculateSmsCost(body).segments;
      worstSegments = Math.max(worstSegments, segments);

      try {
        await this.sms.send({ to: recipient.phoneNumber, body });
        sentCount += 1;
        // Counted only on success, so the recorded spend is what the
        // provider will actually bill rather than what was attempted.
        segmentsSent += segments;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`MarketingSmsService: send failed for ${recipient.phoneNumber}: ${message}`);
        failedRecipients.push({ phoneNumber: recipient.phoneNumber, error: message });
      }
    }

    return { sentCount, failedRecipients, segmentsSent, worstSegments };
  }

  /** Surfaces a gateway that cannot send at all as one campaign-level error rather than N recipient-level ones. */
  private assertGatewayReady(): void {
    try {
      this.sms.assertReady?.();
    } catch (error) {
      throw new MarketingSmsValidationError(
        error instanceof Error ? `${error.message} Nothing was sent.` : 'SMS is not configured. Nothing was sent.',
      );
    }
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
    const linkUrl = normalizeLinkUrl(input.linkUrl);
    const offerText = input.offerText?.trim() || null;

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

    if (input.linkUrl?.trim() && !linkUrl) {
      throw new MarketingSmsValidationError(
        'That web address does not look valid. Include the full address, e.g. https://snackquests.shop/boxes.',
      );
    }

    const tokenProblem = validateTokens({ bodyText, linkUrl, offerText });
    if (tokenProblem) {
      throw new MarketingSmsValidationError(tokenProblem);
    }

    if (input.segment === 'custom') {
      const numbers = normalizeCustomRecipients(input.customRecipients ?? []);
      if (numbers.length === 0) {
        throw new MarketingSmsValidationError('Add at least one valid Kenyan mobile number, or pick a segment instead.');
      }
      return { name, bodyText, segment: 'custom', customRecipients: numbers, linkUrl, offerText };
    }

    return { name, bodyText, segment: input.segment, customRecipients: null, linkUrl, offerText };
  }

  private async requireOwned(businessId: string, campaignId: string): Promise<MarketingSmsCampaign> {
    const campaign = await marketingSmsRepository.findById(campaignId);
    if (!campaign || campaign.businessId !== businessId) {
      throw new MarketingSmsNotFoundError(campaignId);
    }
    return campaign;
  }
}

/** Costing and sample rendering need a stand-in when the audience is empty. A name of average length, so the sample is representative rather than flattering. */
const SAMPLE_RECIPIENT: SmsRecipient = { phoneNumber: '254700000000', customerName: 'Amina' };

/**
 * Accepts what someone would actually paste, and rejects what cannot be
 * tapped. A bare `snackquests.shop/boxes` gets `https://` so the
 * recipient's phone linkifies it; anything that is not a URL at all
 * returns null for the caller to report.
 */
function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) {
      return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
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

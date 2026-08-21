import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * Who a marketing SMS campaign goes out to (§ Admin: Marketing SMS).
 *
 * These are customer segments, which Marketing Emails deliberately has
 * none of — its own type notes that checkout never collects an email
 * address, so a customer email segment would have nothing to send to.
 * SMS is the other way round: the phone number is the one identity
 * every Snack Quest customer has, which is what makes reaching them
 * possible here and impossible there.
 *
 * Every option but `'custom'` is a live aggregation over real orders
 * via `CustomerService`, not a stored list — a customer moves between
 * `one_time` and `repeat` by ordering, with nothing to keep in sync.
 *
 * - `recent_customers` / `lapsed_customers`: ordered within the last 30
 *   days, or not within 60. The gap between them is intentional; a
 *   customer 45 days out is in neither, because they are neither fresh
 *   enough for a "thanks again" nor cold enough for a win-back.
 * - `high_value_customers`: lifetime spend at or above
 *   `HIGH_VALUE_CUSTOMER_THRESHOLD_KES`.
 * - `custom`: hand-typed numbers, for a list that came from somewhere
 *   this system does not know about.
 */
export type MarketingSmsSegment =
  | 'all_customers'
  | 'recent_customers'
  | 'lapsed_customers'
  | 'repeat_customers'
  | 'one_time_customers'
  | 'high_value_customers'
  | 'custom';

export type MarketingSmsStatus = 'draft' | 'sending' | 'sent' | 'failed';

/** One recipient a send attempt actually failed for, and the real gateway error — same discipline as `MarketingEmailFailedRecipient`. */
export interface MarketingSmsFailedRecipient {
  phoneNumber: string;
  error: string;
}

/**
 * `marketingSmsCampaigns/{campaignId}` — a staff-composed SMS blast to
 * customers (§ Admin: Marketing SMS).
 *
 * Its own collection rather than a `notificationTemplates` entry for
 * the same reason marketing emails are: `NotificationService.send()`
 * wants a pre-seeded template code and is single-recipient and
 * idempotent-by-dedupeKey, none of which fits ad-hoc staff-authored
 * content going to many people at once.
 *
 * The one thing this records that its email counterpart does not is
 * cost. Email is effectively free per recipient; SMS is billed per
 * 160-character segment per recipient, so what a campaign cost is a
 * real number an operator has to be able to see afterwards — and be
 * shown before they press send.
 */
export interface MarketingSmsCampaign extends AuditFields {
  businessId: string;
  /** Internal label for the campaigns list — never sent to anyone. SMS has no subject line, so without this every campaign would be identified by the first few words of its own body. */
  name: string;
  /** The message as composed. The per-recipient opt-out link is appended at send time and is deliberately NOT stored here — it differs per recipient, and storing one recipient's link on the campaign would misrepresent what everyone else received. */
  bodyText: string;
  segment: MarketingSmsSegment;
  /** Only meaningful when `segment === 'custom'` — normalised, deduped `254…` numbers. */
  customRecipients: string[] | null;
  status: MarketingSmsStatus;
  /** Recipients resolved at send time, AFTER opt-outs are removed — the number of people actually texted, not the size of the segment. */
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  /**
   * How many people the segment matched but the opt-out register
   * excluded. Recorded rather than silently dropped so the register is
   * visibly doing its job, and so a campaign whose reach fell has an
   * explanation that is not "something broke".
   */
  optedOutSkippedCount: number;
  failedRecipients: MarketingSmsFailedRecipient[] | null;
  /** Billable segments per message at send time — 1 for an ordinary message, more if it ran long or contained a non-GSM-7 character. See `lib/sms/segments.ts`. */
  segmentsPerMessage: number;
  /** `segmentsPerMessage × sentCount`: what this campaign actually cost, in the unit the provider bills in. */
  totalSegmentsSent: number;
  sentAt: Timestamp | null;
}

/** Lifetime spend at or above this puts a customer in `high_value_customers`. A round number chosen to sit above a single mid-size box, so it means "has come back and spent real money", not "ordered once". */
export const HIGH_VALUE_CUSTOMER_THRESHOLD_KES = 5000;

/** `recent_customers`: ordered within this many days. */
export const RECENT_CUSTOMER_DAYS = 30;

/** `lapsed_customers`: no order for at least this many days. Deliberately wider than `RECENT_CUSTOMER_DAYS` — see `MarketingSmsSegment`. */
export const LAPSED_CUSTOMER_DAYS = 60;

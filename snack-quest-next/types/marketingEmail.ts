import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * Who a campaign goes out to (§ Admin: Marketing Emails). Every option
 * but `'custom'` is a live query against real creator data — status,
 * or real referral-conversion/registration activity
 * (`creatorProfiles.totalConversions`/`createdAt`). There is
 * deliberately no customer segment: `OrderCustomer`/`CustomerProfile`
 * never capture an email address anywhere in this codebase (checkout
 * only ever collects phone + name + county), so a customer segment
 * would have nothing real to send to. `'custom'` is the escape hatch
 * for a hand-picked list until that gap is closed.
 *
 * - `no_sale_creators` / `first_sale_creators` / `repeat_creators`:
 *   `totalConversions` exactly 0, exactly 1, or 2+ — a conversion is
 *   credited the instant a valid referral code is used (see
 *   `ReferralService.awardCommission`), regardless of the creator's
 *   own approval status, so this is a real sales-activity signal, not
 *   a proxy for status.
 * - `new_creators`: registered in the last 30 days.
 */
export type MarketingEmailSegment =
  | 'all_creators'
  | 'active_creators'
  | 'pending_creators'
  | 'suspended_creators'
  | 'no_sale_creators'
  | 'first_sale_creators'
  | 'repeat_creators'
  | 'new_creators'
  | 'custom';

export type MarketingEmailStatus = 'draft' | 'sending' | 'sent' | 'failed';

/** A real, published review featured in an email — see `ReviewService.listPublished`, the only source this is ever built from. */
export interface MarketingEmailTestimonial {
  customerName: string;
  rating: number;
  body: string;
}

/**
 * `marketingEmailCampaigns/{campaignId}` — a staff-composed branded
 * email blast (§ Admin: Marketing Emails). Deliberately its own
 * collection rather than a `notificationTemplates` entry:
 * `NotificationService.send()` requires a pre-seeded template code and
 * is single-recipient/idempotent-by-dedupeKey, neither of which fits
 * ad-hoc staff-authored content sent to many recipients at once — see
 * `services/marketingEmailService.ts`.
 */
export interface MarketingEmailCampaign extends AuditFields {
  businessId: string;
  subject: string;
  /** Inbox preview text (shows next to the subject in most clients, invisible in the email body itself). */
  preheader: string | null;
  heading: string;
  /** Plain text, blank-line-separated paragraphs — rendered into the branded HTML shell, never raw HTML from the composer. */
  bodyText: string;
  /** A hero image shown below the header bar, uploaded via the same Vercel Blob `'marketing'` directory every other admin image upload uses. */
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  /** Up to 3 short highlight pills shown below the message (e.g. "🚚 Nairobi delivery in 24h") — the sender types the whole pill text, emoji included. */
  featurePills: string[];
  /** Whether to feature up to 2 of the business's own real, published reviews as social proof — omitted entirely (not a blank section) when none are published. Never fabricated: always a live `ReviewService.listPublished` read at send time. */
  includeTestimonials: boolean;
  /** The exact reviews actually featured at send time — `null` for a draft that hasn't sent yet. Stored rather than re-derived later, same discipline as `OutboundMessage.renderedBody`: the history view shows what really went out, not today's current reviews. */
  sentTestimonials: MarketingEmailTestimonial[] | null;
  segment: MarketingEmailSegment;
  /** Only meaningful when `segment === 'custom'` — validated, deduped email addresses. */
  customRecipients: string[] | null;
  status: MarketingEmailStatus;
  /** Recipients resolved at send time — 0 for a draft that has never been sent. */
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: Timestamp | null;
}

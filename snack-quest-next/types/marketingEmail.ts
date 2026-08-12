import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * Who a campaign goes out to (§ Admin: Marketing Emails). Every option
 * but `'custom'` is a live `creatorProfiles.status` filter — there is
 * deliberately no customer segment: `OrderCustomer`/`CustomerProfile`
 * never capture an email address anywhere in this codebase (checkout
 * only ever collects phone + name + county), so a customer segment
 * would have nothing real to send to. `'custom'` is the escape hatch
 * for a hand-picked list until that gap is closed.
 */
export type MarketingEmailSegment = 'all_creators' | 'active_creators' | 'pending_creators' | 'suspended_creators' | 'custom';

export type MarketingEmailStatus = 'draft' | 'sending' | 'sent' | 'failed';

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

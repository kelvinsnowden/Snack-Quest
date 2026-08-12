import type { Timestamp } from 'firebase/firestore';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';
export type NotificationRecipientType = 'creator' | 'customer' | 'staff';

/**
 * `notifications/{notificationId}` — scoped per recipient, unlike the
 * current unreadable-at-scale log. TDD §8. Rules §9 allow the recipient
 * to update only the `read` field.
 */
export interface Notification {
  businessId: string;
  recipientId: string;
  recipientType: NotificationRecipientType;
  channel: NotificationChannel;
  templateCode: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: Timestamp;
}

/**
 * `notificationTemplates/{templateId}` — per-channel, versioned copy
 * (PLATFORM_ARCHITECTURE_V2.md §10). Deliberately platform-wide, not
 * `businessId`-scoped — the doc's own field list for this collection
 * has no `businessId`, and template *content* is closer to deployment
 * configuration (like the single Vercel Blob store, § Vercel Blob
 * migration) than to per-tenant data; a real second tenant needing its
 * own copy is a natural extension point, not a correctness gap today
 * (ADR-0006: multi-tenancy is a reserved seam, not built
 * infrastructure, until a second tenant is funded).
 */
export interface NotificationTemplate {
  templateCode: string;
  channel: NotificationChannel;
  /** Email only — ignored for every other channel. */
  subject: string | null;
  /** `{{token}}` placeholders, one per entry in `requiredParams`. */
  bodyTemplate: string;
  /** Email only — the branded HTML alternative sent alongside `bodyTemplate`'s plain text. `null` for every non-email template, and for any email template that hasn't been given one yet (falls back to plain text only). */
  htmlBodyTemplate: string | null;
  requiredParams: string[];
  version: number;
  isActive: boolean;
}

export type OutboundMessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';

/**
 * `outboundMessages/{messageId}` — the real per-channel dispatch log
 * (PLATFORM_ARCHITECTURE_V2.md §10), replacing the old system's
 * `NotificationLog` whose `status` was written once as `'queued'` and
 * essentially never observed transitioning further. `retryCount`
 * backs the retry sweep (`NotificationService.retrySweep()`) — a
 * message stuck at `'failed'` below the retry ceiling is a real,
 * queryable, actionable backlog, not a silently dropped send.
 */
export interface OutboundMessage {
  businessId: string;
  /** Set when this dispatch also produced an in-app `notifications` entry — not every channel does. */
  notificationId: string | null;
  channel: NotificationChannel;
  templateCode: string;
  /** Phone number / email address / uid, depending on `channel`. */
  recipientRef: string;
  /**
   * The template rendered once, at the original send attempt — the
   * retry sweep resends this exact content rather than re-rendering
   * from `templateCode` + params (which aren't stored here at all):
   * a retry should deliver what was originally composed, not a
   * different result if the template happened to change in between.
   */
  renderedSubject: string | null;
  renderedBody: string;
  /** Email only — the rendered HTML alternative, `null` when the template has none (plain-text send). */
  renderedHtmlBody: string | null;
  providerMessageId: string | null;
  status: OutboundMessageStatus;
  failureReason: string | null;
  createdAt: Timestamp;
  sentAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  retryCount: number;
}

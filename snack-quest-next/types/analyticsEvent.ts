import type { Timestamp } from 'firebase/firestore';

/**
 * `analyticsEvents/{analyticsEventId}` — one named funnel event (§
 * exit-intent rescue offer), sibling to `PageView` rather than a
 * replacement for it: a page view is "someone looked at a URL", this
 * is "someone did a specific thing" (saw the rescue popup, clicked its
 * CTA, reached checkout, completed the purchase). Same visitor-cookie
 * identity as `PageView` (`VISITOR_COOKIE`) so the two can be joined by
 * `visitorId` later if needed, same public/unauthenticated,
 * light-validation posture as `pageViewService` — this is funnel
 * telemetry, not money or a customer's data.
 *
 * `visitorId` is nullable because not every event has a browser to
 * read a cookie from: `rescue_offer_purchase_completed` fires from
 * `ConversationService.completeOrder`, off an async Daraja webhook
 * with no request/cookie context at all (see that function's own doc
 * comment) — `metadata.orderId` is what ties it back to a real order
 * instead.
 */
export interface AnalyticsEvent {
  businessId: string;
  event: string;
  visitorId: string | null;
  metadata: Record<string, string | number | boolean> | null;
  createdAt: Timestamp;
}

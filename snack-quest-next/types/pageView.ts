import type { Timestamp } from 'firebase/firestore';

/**
 * `pageViews/{pageViewId}` — one visit to one page of the public
 * marketing site (§ Admin: Analytics, website traffic).
 *
 * Recorded by a client-side beacon (`PageViewTracker.tsx`), not a
 * server-side request log: a script that only runs in a real browser
 * naturally excludes the crawlers and uptime monitors that never
 * execute JavaScript, which is a better "real visitor" signal than
 * every raw HTTP request would be, with no bot-detection code of its
 * own needed.
 *
 * `visitorId` is a random id in a first-party, httpOnly cookie
 * (`app/api/analytics/track/route.ts`) — enough to tell "one person,
 * several page views" from "several people", without anything that
 * identifies who that person actually is.
 */
export interface PageView {
  businessId: string;
  path: string;
  visitorId: string;
  /** Null for a direct visit or one arriving with no Referer at all — never fabricated. */
  referrer: string | null;
  createdAt: Timestamp;
}

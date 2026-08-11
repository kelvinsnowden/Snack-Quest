/**
 * First-party cookie names this app sets on the marketing site and
 * reads back at checkout (§ close the loop: ad-conversion
 * attribution). Split into their own module, no other imports, so
 * both `app/api/analytics/track/route.ts` (which sets them) and
 * `app/api/checkout/web/route.ts` (which reads them) reference the
 * same literal names without importing one route from the other.
 */

/** Set once per browser on the first page view; identifies "one person, several page views" (§ Admin: Analytics, website traffic). */
export const VISITOR_COOKIE = 'sq_visitor';
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * TikTok's own click id, appended to the landing URL by TikTok when an
 * ad is clicked (`?ttclid=...`). Captured first-touch — once set, never
 * overwritten by a later visit — because it names the ad that actually
 * earned the click, not whichever page the visitor happened to reload.
 * 30 days mirrors TikTok's own default click-through attribution
 * window, so the cookie doesn't outlive what TikTok itself would still
 * credit.
 */
export const TTCLID_COOKIE = 'sq_ttclid';

/** Meta's equivalent click id (`?fbclid=...`) — same first-touch, same window, kept for the day Meta's own event similarly wants it alongside the hashed-phone match Meta's Advanced Matching already uses. */
export const FBCLID_COOKIE = 'sq_fbclid';

export const AD_CLICK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

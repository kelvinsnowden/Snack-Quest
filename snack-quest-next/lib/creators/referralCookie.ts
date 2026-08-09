/**
 * Remembers which creator sent a visitor (§ Website Becomes the
 * Primary Commerce Channel).
 *
 * `/r/<code>` redirects to `/checkout?ref=<code>`, which is enough
 * when the visitor buys immediately. It isn't enough for the visitor
 * who lands, goes to read about the boxes first, and comes back — the
 * query parameter is gone by then and the creator loses a sale they
 * genuinely made. A cookie set at click time covers that gap, and the
 * `?ref=` parameter still wins when both are present so an explicitly
 * shared link always beats a stale earlier click.
 *
 * Deliberately not a tracking identifier: it stores one referral code,
 * nothing about the person, and it is the same value already visible
 * in the URL they arrived on.
 */

export const REFERRAL_COOKIE_NAME = 'sq_ref';

/**
 * Long enough to survive browsing and coming back another evening,
 * short enough that a code from months ago doesn't quietly attach to
 * a purchase the creator had nothing to do with.
 */
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * `Lax` rather than `Strict`: the cookie has to survive the top-level
 * redirect from `/r/<code>`, and it must still be sent when a visitor
 * follows a link from the creator's own social post.
 */
export function buildReferralCookie(code: string): string {
  return [
    `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(code)}`,
    'Path=/',
    `Max-Age=${REFERRAL_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    'HttpOnly',
    'Secure',
  ].join('; ');
}

/** The query parameter wins over the cookie — an explicitly shared link beats a remembered earlier click. */
export function resolveReferralCode(
  queryCode: string | undefined,
  cookieCode: string | undefined,
): string | null {
  const candidate = queryCode?.trim() || cookieCode?.trim();
  return candidate ? candidate.toUpperCase() : null;
}

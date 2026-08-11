import { randomUUID } from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';
import { pageViewService, PageViewValidationError } from '@/services/pageViewService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import {
  AD_CLICK_COOKIE_MAX_AGE_SECONDS,
  FBCLID_COOKIE,
  TTCLID_COOKIE,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/analytics/cookies';

/**
 * `POST /api/analytics/track` (§ Admin: Analytics, website traffic;
 * § close the loop: ad-conversion attribution) — where
 * `PageViewTracker.tsx`'s beacon sends one event per page a visitor
 * lands on. Public and unauthenticated, same as `/api/reviews`.
 *
 * Also where TikTok's/Meta's click ids get captured into first-party
 * cookies, the moment a visitor lands from an ad: `PageViewTracker`
 * reads `ttclid`/`fbclid` straight off the landing URL and forwards
 * them here, first-touch (a cookie already set is never overwritten —
 * whichever ad actually earned the click keeps credit for the whole
 * attribution window, not a later organic reload). `startWebCheckout`
 * reads these same cookies back at checkout to attribute the order.
 *
 * Reads/writes cookies from the raw `Request`/`Response` (the `cookie`
 * package) rather than `next/headers`'s `cookies()`, same reasoning as
 * `app/api/auth/session/route.ts`: it keeps this route directly
 * testable outside a live Next.js request scope.
 *
 * The visitor cookie is httpOnly — nothing on the page ever reads it,
 * it only has to come back on this route's own requests, and keeping
 * it out of `document.cookie` is one less thing a page script could
 * leak. Same for the click-id cookies below.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { path, referrer, ttclid, fbclid } = (body ?? {}) as {
    path?: unknown;
    referrer?: unknown;
    ttclid?: unknown;
    fbclid?: unknown;
  };
  if (typeof path !== 'string') {
    return Response.json({ error: 'body must include a string "path"' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie');
  const existingCookies = cookieHeader ? parseCookie(cookieHeader) : {};
  const existingVisitorId = existingCookies[VISITOR_COOKIE];
  const visitorId = existingVisitorId || randomUUID();

  try {
    await pageViewService.record(getCurrentBusinessId(), {
      path,
      visitorId,
      referrer: typeof referrer === 'string' && referrer ? referrer : null,
    });
  } catch (error) {
    if (error instanceof PageViewValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const response = new Response(null, { status: 204 });
  if (!existingVisitorId) {
    response.headers.append(
      'Set-Cookie',
      stringifySetCookie({
        name: VISITOR_COOKIE,
        value: visitorId,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
      }),
    );
  }

  for (const [cookieName, value] of [
    [TTCLID_COOKIE, ttclid],
    [FBCLID_COOKIE, fbclid],
  ] as const) {
    if (typeof value === 'string' && value && !existingCookies[cookieName]) {
      response.headers.append(
        'Set-Cookie',
        stringifySetCookie({
          name: cookieName,
          value,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: AD_CLICK_COOKIE_MAX_AGE_SECONDS,
        }),
      );
    }
  }

  return response;
}

import { randomUUID } from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';
import { pageViewService, PageViewValidationError } from '@/services/pageViewService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `POST /api/analytics/track` (§ Admin: Analytics, website traffic) —
 * where `PageViewTracker.tsx`'s beacon sends one event per page a
 * visitor lands on. Public and unauthenticated, same as `/api/reviews`.
 *
 * Reads/writes the visitor-id cookie from the raw `Request`/`Response`
 * (the `cookie` package) rather than `next/headers`'s `cookies()`,
 * same reasoning as `app/api/auth/session/route.ts`: it keeps this
 * route directly testable outside a live Next.js request scope.
 *
 * The cookie is httpOnly — nothing on the page ever reads it, it only
 * has to come back on this route's own requests, and keeping it out
 * of `document.cookie` is one less thing a page script could leak.
 */

const VISITOR_COOKIE = 'sq_visitor';
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { path, referrer } = (body ?? {}) as { path?: unknown; referrer?: unknown };
  if (typeof path !== 'string') {
    return Response.json({ error: 'body must include a string "path"' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie');
  const existingVisitorId = cookieHeader ? parseCookie(cookieHeader)[VISITOR_COOKIE] : undefined;
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
  return response;
}

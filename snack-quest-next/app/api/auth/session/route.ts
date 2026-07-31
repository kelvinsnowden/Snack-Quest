import { stringifySetCookie } from 'cookie';
import { staffAuthService, StaffNotProvisionedError } from '@/services/staffAuthService';
import { STAFF_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * The one place a client-side Firebase ID token becomes a server-side
 * staff session (§ Admin auth foundation). Called by `/admin/login`
 * right after `signInWithEmailAndPassword` succeeds — this route
 * never itself checks a password; Firebase Auth already did that by
 * the time an ID token reaches here. What this route adds is the part
 * Firebase Auth alone can't: confirming the uid is actually
 * provisioned staff, and turning that into an httpOnly session cookie
 * a Server Component can verify without trusting anything the client
 * sends on later requests.
 *
 * Sets the cookie by building the `Set-Cookie` header directly (the
 * `cookie` package) rather than via `next/headers`'s `cookies()` —
 * deliberately, so this route can be exercised directly in tests
 * (`cookies()` throws outside a live Next.js request scope, confirmed
 * empirically; a plain `Request`/`Response` Route Handler has no such
 * restriction and is an equally supported pattern).
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { idToken } = (body ?? {}) as { idToken?: unknown };
  if (typeof idToken !== 'string' || !idToken) {
    return Response.json({ error: 'body must include a non-empty string idToken' }, { status: 400 });
  }

  try {
    const { cookie, maxAgeMs, session } = await staffAuthService.establishSession(idToken);

    const response = Response.json({ session });
    response.headers.append(
      'Set-Cookie',
      stringifySetCookie({
        name: STAFF_SESSION_COOKIE,
        value: cookie,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(maxAgeMs / 1000),
      }),
    );
    return response;
  } catch (error) {
    if (error instanceof StaffNotProvisionedError) {
      return Response.json(
        { error: 'This account is not provisioned as staff. Contact a super admin.' },
        { status: 403 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not establish session' },
      { status: 401 },
    );
  }
}

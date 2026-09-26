import { stringifySetCookie } from 'cookie';
import { partnerAuthService, PartnerNotProvisionedError } from '@/services/partnerAuthService';
import { PARTNER_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * Partner (machine owner) sign-in (§ PART 2 — OWNER PORTAL). Called
 * right after `signInWithEmailAndPassword` succeeds; confirms the uid
 * has already claimed a partner account and turns that into an
 * httpOnly session cookie — the same shape as
 * `app/api/creator/session/route.ts`.
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
    const { cookie, maxAgeMs, session } = await partnerAuthService.login(idToken);

    const response = Response.json({ session });
    response.headers.append(
      'Set-Cookie',
      stringifySetCookie({
        name: PARTNER_SESSION_COOKIE,
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
    if (error instanceof PartnerNotProvisionedError) {
      return Response.json({ error: 'This account has not claimed a Snack Quest partner login yet.' }, { status: 403 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not establish session' }, { status: 401 });
  }
}

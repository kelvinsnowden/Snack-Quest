import { stringifySetCookie } from 'cookie';
import { creatorAuthService, CreatorNotProvisionedError } from '@/services/creatorAuthService';
import { CREATOR_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * Creator sign-in (§ Creator Portal auth) — the same shape as
 * `app/api/auth/session/route.ts`'s staff equivalent. Called right
 * after `signInWithEmailAndPassword` succeeds; confirms the uid is
 * actually a provisioned creator (not just any Firebase Auth account)
 * and turns that into an httpOnly session cookie.
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
    const { cookie, maxAgeMs, session } = await creatorAuthService.login(idToken);

    const response = Response.json({ session });
    response.headers.append(
      'Set-Cookie',
      stringifySetCookie({
        name: CREATOR_SESSION_COOKIE,
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
    if (error instanceof CreatorNotProvisionedError) {
      return Response.json(
        { error: 'This account is not registered as a creator yet.' },
        { status: 403 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not establish session' },
      { status: 401 },
    );
  }
}

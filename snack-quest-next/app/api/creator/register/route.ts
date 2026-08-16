import { stringifySetCookie } from 'cookie';
import { creatorAuthService, CreatorAlreadyRegisteredError, InvalidCreatorRegistrationError } from '@/services/creatorAuthService';
import { CREATOR_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * The one place a client-side Firebase Auth account becomes a real
 * creator account (§ Creator Portal auth). Called by `/creator/register`
 * right after `createUserWithEmailAndPassword` succeeds — the account
 * itself already exists by the time an ID token reaches here; what
 * this route adds is the two Firestore documents (`users/{uid}`,
 * `businesses/{businessId}/creatorMemberships/{uid}`) that a client can never create directly,
 * plus the session cookie that lets a Server Component trust the
 * result on every later request.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { idToken, displayName } = (body ?? {}) as { idToken?: unknown; displayName?: unknown };
  if (typeof idToken !== 'string' || !idToken) {
    return Response.json({ error: 'body must include a non-empty string idToken' }, { status: 400 });
  }
  if (typeof displayName !== 'string' || !displayName.trim()) {
    return Response.json({ error: 'body must include a non-empty string displayName' }, { status: 400 });
  }

  try {
    const { cookie, maxAgeMs, session } = await creatorAuthService.register(idToken, displayName);

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
    if (error instanceof CreatorAlreadyRegisteredError) {
      return Response.json(
        { error: 'This account is already registered as a creator. Sign in instead.' },
        { status: 409 },
      );
    }
    if (error instanceof InvalidCreatorRegistrationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not register' },
      { status: 401 },
    );
  }
}

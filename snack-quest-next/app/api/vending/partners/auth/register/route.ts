import { stringifySetCookie } from 'cookie';
import { partnerAuthService, PartnerAlreadyClaimedError, PartnerNotProvisionedError } from '@/services/partnerAuthService';
import { PARTNER_SESSION_COOKIE } from '@/lib/auth/cookieName';

/**
 * The one place a client-side Firebase Auth account claims an
 * existing, staff-created `Partner` record (§ PART 2 — OWNER PORTAL,
 * `services/partnerAuthService.ts`'s own doc comment for why this is
 * a *claim*, not a registration). Called right after
 * `createUserWithEmailAndPassword` succeeds, exactly the same shape
 * as `app/api/creator/register/route.ts`.
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
    const { cookie, maxAgeMs, session } = await partnerAuthService.register(idToken);

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
    if (error instanceof PartnerAlreadyClaimedError || error instanceof PartnerNotProvisionedError) {
      return Response.json(
        { error: 'No unclaimed Snack Quest partner account matches this email. Contact Snack Quest to set one up.' },
        { status: 403 },
      );
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not register' }, { status: 401 });
  }
}

import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseCookie } from 'cookie';
import { partnerAuthService, type PartnerSession } from '@/services/partnerAuthService';
import { PARTNER_SESSION_COOKIE } from './cookieName';

/**
 * The Data Access Layer for partner (machine owner) sessions
 * (§ PART 2 — OWNER PORTAL) — same pattern as `lib/auth/creatorSession.ts`,
 * kept as its own module (own cookie, own Service) so an owner and a
 * staff/creator session can coexist in one browser without ever being
 * conflated.
 */

export { PARTNER_SESSION_COOKIE };

export const getPartnerSession = cache(async (): Promise<PartnerSession | null> => {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
  if (!cookie) {
    return null;
  }
  return partnerAuthService.verifySessionCookie(cookie);
});

/** For Server Components/layouts that must not render at all without a valid partner session. */
export async function requirePartnerSession(redirectTo = '/partner/login'): Promise<PartnerSession> {
  const session = await getPartnerSession();
  if (!session) {
    redirect(redirectTo);
  }
  return session;
}

/** Same as `verifyStaffSessionFromRequest`/`verifyCreatorSessionFromRequest` — for partner mutation Route Handlers that need the raw `Request` cookie header rather than `next/headers`. */
export async function verifyPartnerSessionFromRequest(request: Request): Promise<PartnerSession | null> {
  const header = request.headers.get('cookie');
  if (!header) {
    return null;
  }
  const cookie = parseCookie(header)[PARTNER_SESSION_COOKIE];
  if (!cookie) {
    return null;
  }
  return partnerAuthService.verifySessionCookie(cookie);
}

import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseCookie } from 'cookie';
import { creatorAuthService, type CreatorSession } from '@/services/creatorAuthService';
import { CREATOR_SESSION_COOKIE } from './cookieName';

/**
 * The Data Access Layer for creator sessions — same pattern and same
 * reasoning as `lib/auth/session.ts`'s staff equivalent, kept as a
 * separate module (own cookie, own Service) rather than parameterized
 * over both, since a creator and a staff member can be signed in in
 * the same browser at once and the two checks must never be conflated.
 */

export { CREATOR_SESSION_COOKIE };

export const getCreatorSession = cache(async (): Promise<CreatorSession | null> => {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(CREATOR_SESSION_COOKIE)?.value;
  if (!cookie) {
    return null;
  }
  return creatorAuthService.verifySessionCookie(cookie);
});

/** For Server Components/layouts that must not render at all without a valid creator session. */
export async function requireCreatorSession(redirectTo = '/creator/login'): Promise<CreatorSession> {
  const session = await getCreatorSession();
  if (!session) {
    redirect(redirectTo);
  }
  return session;
}

/** Same as `verifyStaffSessionFromRequest` — for creator mutation Route Handlers that need to read the raw `Request` cookie header rather than `next/headers`. */
export async function verifyCreatorSessionFromRequest(request: Request): Promise<CreatorSession | null> {
  const header = request.headers.get('cookie');
  if (!header) {
    return null;
  }
  const cookie = parseCookie(header)[CREATOR_SESSION_COOKIE];
  if (!cookie) {
    return null;
  }
  return creatorAuthService.verifySessionCookie(cookie);
}

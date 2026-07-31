import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { staffAuthService, type StaffSession } from '@/services/staffAuthService';
import { STAFF_SESSION_COOKIE } from './cookieName';

/**
 * The Data Access Layer for staff sessions (§ Admin auth foundation,
 * following Next.js's own recommended DAL pattern). Every Server
 * Component, Route Handler, and Server Action that needs to know
 * "who is this staff member, really" calls through here — never reads
 * the session cookie or calls Firebase Admin Auth directly. `cache()`
 * dedupes repeated calls within one render pass (e.g. the admin
 * layout and a nested page both calling `requireStaffSession()`)
 * without caching across requests.
 */

export { STAFF_SESSION_COOKIE };

export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  if (!cookie) {
    return null;
  }
  return staffAuthService.verifySessionCookie(cookie);
});

/** For Server Components/layouts that must not render at all without a valid staff session. */
export async function requireStaffSession(redirectTo = '/admin/login'): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    redirect(redirectTo);
  }
  return session;
}

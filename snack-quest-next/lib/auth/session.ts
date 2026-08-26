import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseCookie } from 'cookie';
import { staffAuthService, type StaffSession } from '@/services/staffAuthService';
import { STAFF_SESSION_COOKIE } from './cookieName';
import { applyViewAs, VIEW_AS_COOKIE } from './viewAs';

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
  const session = await staffAuthService.verifySessionCookie(cookie);
  if (!session) {
    return null;
  }
  // A super admin looking through another role (§ see it from every
  // angle). Only ever narrows, and only for a super admin — see
  // `applyViewAs`.
  return applyViewAs(session, cookieStore.get(VIEW_AS_COOKIE)?.value);
});

/**
 * The session as it really is, ignoring any chosen role.
 *
 * Exists for exactly one caller: the route that changes or clears the
 * choice. Authorising that against the narrowed roles would mean a
 * super admin viewing as `warehouse` could no longer switch back,
 * because a warehouse account may not make this call.
 */
export async function getRealStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  return cookie ? staffAuthService.verifySessionCookie(cookie) : null;
}

/** For Server Components/layouts that must not render at all without a valid staff session. */
export async function requireStaffSession(redirectTo = '/admin/login'): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    redirect(redirectTo);
  }
  return session;
}

/**
 * The same Secure-tier check as `getStaffSession()`, but for admin
 * mutation Route Handlers (§ Admin: Orders and every workspace after
 * it) — those read the cookie from the raw `Request` via the `cookie`
 * package rather than `next/headers`'s `cookies()`, deliberately,
 * so they can be exercised directly in tests the same way
 * `app/api/auth/session/route.ts` already is (`cookies()` throws
 * outside a live Next.js request scope, confirmed empirically).
 */
export async function verifyStaffSessionFromRequest(request: Request): Promise<StaffSession | null> {
  const header = request.headers.get('cookie');
  if (!header) {
    return null;
  }
  const cookies = parseCookie(header);
  const cookie = cookies[STAFF_SESSION_COOKIE];
  if (!cookie) {
    return null;
  }
  const session = await staffAuthService.verifySessionCookie(cookie);
  if (!session) {
    return null;
  }
  /*
   * Narrowed here as well as for pages, and that is the point: a super
   * admin viewing as `warehouse` must get the same 403 from an
   * admin-only endpoint that a real warehouse account gets, or the
   * simulation is telling them something untrue about what the role
   * can do.
   */
  return applyViewAs(session, cookies[VIEW_AS_COOKIE]);
}

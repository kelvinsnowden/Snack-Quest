import 'server-only';

import type { StaffSession } from '@/services/staffAuthService';

/**
 * Integration credentials (§ Integration Portal) and staff account
 * management (§ Staff Management) are more sensitive than the rest of
 * the Admin Portal — every other `/admin/*` route only requires the
 * `admin`/`super_admin` gate `proxy.ts` already applies to the whole
 * route group. This is the first place in the codebase that needs a
 * narrower check within that group, so it's a small, reusable helper
 * rather than one-off inline checks per route.
 */
export function isSuperAdmin(session: Pick<StaffSession, 'roles'>): boolean {
  return session.roles.includes('super_admin');
}

import type { Role } from '@/types';
import type { StaffSession } from '@/services/staffAuthService';

/**
 * A super admin looking at the product through somebody else's role
 * (§ see it from every angle).
 *
 * The narrowing is real, not cosmetic. It applies to Route Handlers as
 * well as pages, so a super admin viewing as `warehouse` gets the same
 * 403 from an admin-only endpoint that a real warehouse account gets.
 * A simulation that only changed what was drawn would be worse than
 * none: every control would appear to work, and the one thing being
 * checked — what this role can actually do — would be the one thing
 * not being tested.
 *
 * Identity never changes. The session cookie still belongs to the
 * super admin, every audit trail still records their uid, and
 * `actualRoles` keeps what they really are so the banner can say so
 * and the switch itself can be authorised. Nothing here grants a
 * permission; it only ever takes some away.
 */

export const VIEW_AS_COOKIE = 'sq_view_as';

/**
 * Roles worth stepping into. `super_admin` is absent because it is
 * what stepping back out means, and `customer`/`creator` are not staff
 * roles — they have their own portals with their own sign-in.
 */
export const VIEWABLE_ROLES: readonly Role[] = ['admin', 'agent', 'warehouse', 'finance'];

export function isViewableRole(value: unknown): value is Role {
  return typeof value === 'string' && VIEWABLE_ROLES.includes(value as Role);
}

/**
 * Applies a chosen role to a verified session.
 *
 * Refuses unless the real session is a super admin, so a cookie set by
 * hand is inert for everyone else. It is also the reason this can only
 * ever narrow: the only account allowed to use it already holds every
 * role there is.
 */
export function applyViewAs(session: StaffSession, viewAs: string | undefined): StaffSession {
  if (!viewAs || !session.roles.includes('super_admin') || !isViewableRole(viewAs)) {
    return session;
  }
  return {
    ...session,
    roles: [viewAs],
    viewingAs: viewAs,
    actualRoles: session.roles,
  };
}

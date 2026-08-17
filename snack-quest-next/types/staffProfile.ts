import type { AuditFields } from './common';

/**
 * The one primary role a staff account is provisioned with — decides
 * which operational workspace (§ Admin auth foundation) they land in
 * after login. `admin`/`super_admin` reach the full Admin Portal;
 * `agent` lands in the Human Sales Agent workspace; `warehouse` and
 * `finance` land in their respective workspaces. A super_admin can
 * still reach every workspace regardless of this value — see
 * `lib/auth/session.ts`'s workspace-resolution logic.
 */
export type StaffRole = 'admin' | 'super_admin' | 'agent' | 'warehouse' | 'finance';

/**
 * `staffProfiles/{uid}` — staff-specific data. TDD §8, extended with
 * `businessId` (every staff account belongs to exactly one tenant,
 * same discipline as `creatorProfiles`/`customerProfiles`) for the
 * Admin auth foundation. Shared identity (email, display name, the
 * `roles` array the Auth custom claim and Security Rules both trust)
 * lives on the sibling `users/{uid}` document, not here — this
 * document is role-specific detail only, per TDD §8's collection
 * design.
 */
export interface StaffProfile extends AuditFields {
  businessId: string;
  role: StaffRole;
  /**
   * Which Admin Portal sections (`lib/auth/adminSections.ts`'s
   * `AdminSection` keys) this `admin`-role account is restricted to.
   * Empty means unrestricted — full Admin Portal access, same as every
   * account already had before this field was ever read. Only
   * meaningful for `role: 'admin'`; `super_admin` always has
   * everything regardless of this array, and `agent`/`warehouse`/
   * `finance` reach their own dedicated single-purpose workspace
   * instead of the Admin Portal these sections gate.
   */
  permissions: string[];
  department: string;
}

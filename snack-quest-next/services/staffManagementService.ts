import 'server-only';

import crypto from 'node:crypto';
import { adminAuth } from '@/lib/firebase/admin';
import { staffRepository } from '@/repositories/staffRepository';
import { userRepository } from '@/repositories/userRepository';
import { notificationService } from '@/services/notificationService';
import { isAdminSection } from '@/lib/auth/adminSections';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import type { Role, StaffRole } from '@/types';
import { effectivePermissions, findTemplate, isPermissionKey, type PermissionKey } from '@/lib/auth/permissions';

export class StaffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffValidationError';
  }
}

export class StaffNotFoundError extends Error {
  constructor(uid: string) {
    super(`No staff account found for ${uid}.`);
    this.name = 'StaffNotFoundError';
  }
}

export class StaffAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`${email} is already a staff member on this business.`);
    this.name = 'StaffAlreadyExistsError';
  }
}

export class CannotModifySelfError extends Error {
  constructor(action: string) {
    super(`You can't ${action} your own account — ask another super admin.`);
    this.name = 'CannotModifySelfError';
  }
}

export class LastSuperAdminError extends Error {
  constructor() {
    super('This is the only super admin on this business — promote another staff member to super admin first.');
    this.name = 'LastSuperAdminError';
  }
}

const STAFF_ROLES: StaffRole[] = ['admin', 'super_admin', 'agent', 'warehouse', 'finance'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StaffListItem {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  department: string;
  /** Admin Portal sections this account is restricted to — empty means unrestricted (§ Staff access control). */
  permissions: string[];
  disabled: boolean;
  lastSignInAt: string | null;
  createdAt: string | null;
  /** Every role on the account (`users/{uid}.roles`). */
  roles: string[];
  /** The role template chosen for them, or null for their role's default. */
  template: string | null;
  grantedPermissions: string[];
  revokedPermissions: string[];
  /** What they can actually do right now. */
  effectivePermissions: PermissionKey[];
}

export interface StaffAccessInput {
  template: string | null;
  granted: string[];
  revoked: string[];
}

/** Someone tried to give access they don't hold themselves. */
export class PermissionEscalationError extends Error {
  constructor(readonly permissions: string[]) {
    super(`You can only give access you have yourself. You don’t have: ${permissions.join(', ')}.`);
    this.name = 'PermissionEscalationError';
  }
}

/**
 * Who is making a staff change: their uid, roles and effective
 * permissions, from their session. Every change is checked against it,
 * so nobody can produce access they don't hold themselves.
 */
export interface StaffActor {
  uid: string;
  roles: readonly string[];
  permissions: readonly string[];
}

export class SuperAdminOnlyError extends Error {
  constructor(action: string) {
    super(`Only a super admin can ${action}.`);
    this.name = 'SuperAdminOnlyError';
  }
}

const isSuperAdminActor = (actor: StaffActor) => actor.roles.includes('super_admin');

/** Refuses a change that would leave someone holding a permission the actor doesn't hold (and didn't already have). */
function assertWithinActor(actor: StaffActor, before: readonly string[], after: readonly string[]): void {
  if (isSuperAdminActor(actor)) return;
  const beyond = after.filter((key) => !before.includes(key) && !actor.permissions.includes(key));
  if (beyond.length > 0) {
    throw new PermissionEscalationError(beyond);
  }
}

function validatePermissions(permissions: string[]): void {
  const invalid = permissions.filter((p) => !isAdminSection(p));
  if (invalid.length > 0) {
    throw new StaffValidationError(`"permissions" contains unknown section(s): ${invalid.join(', ')}.`);
  }
}

function isoOrNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * A password-reset/invite link that lands the invitee straight on
 * `/admin/accept-invite` — our own branded page, not Firebase's bare
 * `*.firebaseapp.com/__/auth/action` — the same "never leave the app"
 * experience the Creator Portal already has, since Creators set their
 * password at registration and never see a Firebase-hosted page at
 * all. `handleCodeInApp: true` is what makes Firebase skip its own
 * hosted page and link directly to ours instead.
 *
 * Requires the site's domain to be on Firebase Console → Authentication
 * → Settings → Authorized domains, or Admin SDK rejects the link
 * outright (`auth/invalid-continue-uri`) — until that's added, this
 * falls back to the old, plain link rather than ever blocking an
 * invite or a password reset on a one-time console setting.
 */
async function generateStaffPasswordLink(email: string): Promise<string> {
  const actionCodeSettings = {
    url: `${getSiteUrl()}/admin/accept-invite`,
    handleCodeInApp: true,
  };
  try {
    return await adminAuth.generatePasswordResetLink(email, actionCodeSettings);
  } catch {
    return adminAuth.generatePasswordResetLink(email);
  }
}

/** What an account can do, from its roles and stored access. */
function accessOf(
  roles: readonly string[],
  profile: { template?: string | null; grantedPermissions?: string[]; revokedPermissions?: string[]; permissions: string[] },
): Pick<StaffListItem, 'roles' | 'template' | 'grantedPermissions' | 'revokedPermissions' | 'effectivePermissions'> {
  return {
    roles: [...roles],
    template: profile.template ?? null,
    grantedPermissions: profile.grantedPermissions ?? [],
    revokedPermissions: profile.revokedPermissions ?? [],
    effectivePermissions: effectivePermissions({ roles, template: profile.template, granted: profile.grantedPermissions, revoked: profile.revokedPermissions, legacySections: profile.permissions }),
  };
}

class StaffManagementService {
  async listStaff(businessId: string): Promise<StaffListItem[]> {
    const profiles = await staffRepository.listByBusiness(businessId);
    if (profiles.length === 0) {
      return [];
    }

    const authRecords = await adminAuth.getUsers(profiles.map((p) => ({ uid: p.id })));
    const authByUid = new Map(authRecords.users.map((u) => [u.uid, u]));

    const users = await Promise.all(profiles.map((p) => userRepository.findById(p.id)));

    return profiles.map((profile, i) => {
      const user = users[i];
      const authRecord = authByUid.get(profile.id);
      return {
        uid: profile.id,
        email: user?.email ?? authRecord?.email ?? 'unknown',
        displayName: user?.displayName ?? authRecord?.displayName ?? 'Unknown',
        role: profile.data.role,
        department: profile.data.department,
        permissions: profile.data.permissions,
        disabled: authRecord?.disabled ?? false,
        lastSignInAt: isoOrNull(authRecord?.metadata.lastSignInTime),
        createdAt: profile.data.createdAt?.toDate ? profile.data.createdAt.toDate().toISOString() : null,
        ...accessOf(user?.roles ?? [profile.data.role], profile.data),
      };
    });
  }

  async getStaffMember(businessId: string, uid: string): Promise<StaffListItem | null> {
    const all = await this.listStaff(businessId);
    return all.find((member) => member.uid === uid) ?? null;
  }

  /**
   * Changes what someone may do: a role template, plus permissions added
   * or taken away one by one. Never your own access, and never access you
   * don't hold yourself — so nobody can hand out more than they have.
   * Grants already in the template and removals not in it are dropped, so
   * what's stored is exactly the difference from the template.
   */
  async setAccess(
    businessId: string,
    uid: string,
    input: StaffAccessInput,
    actor: { uid: string; permissions: readonly string[] },
  ): Promise<{ before: PermissionKey[]; after: PermissionKey[]; stored: StaffAccessInput }> {
    if (uid === actor.uid) {
      throw new CannotModifySelfError('change your own access');
    }
    if (input.template !== null && !findTemplate(input.template)) {
      throw new StaffValidationError(`Unknown role template "${input.template}".`);
    }
    const unknown = [...input.granted, ...input.revoked].filter((key) => !isPermissionKey(key));
    if (unknown.length > 0) {
      throw new StaffValidationError(`Unknown permission(s): ${unknown.join(', ')}.`);
    }
    const profile = await this.requireProfile(businessId, uid);
    const user = await userRepository.findById(uid);
    const roles = user?.roles ?? [profile.role];
    if (roles.includes('super_admin')) {
      throw new StaffValidationError('A super admin always has every permission. Change their role first to narrow what they can do.');
    }

    const templatePermissions = new Set<string>(
      findTemplate(input.template)?.permissions ?? effectivePermissions({ roles, legacySections: input.template === null ? profile.permissions : [] }),
    );
    const granted = [...new Set(input.granted)].filter((key) => !templatePermissions.has(key)).sort();
    const revoked = [...new Set(input.revoked)].filter((key) => templatePermissions.has(key)).sort();
    const stored: StaffAccessInput = { template: input.template, granted, revoked };

    const before = accessOf(roles, profile).effectivePermissions;
    const after = effectivePermissions({ roles, template: stored.template, granted, revoked, legacySections: profile.permissions });
    const beyondActor = after.filter((key) => !before.includes(key) && !actor.permissions.includes(key));
    if (beyondActor.length > 0) {
      throw new PermissionEscalationError(beyondActor);
    }

    await staffRepository.update(uid, { template: stored.template, grantedPermissions: granted, revokedPermissions: revoked }, actor.uid);
    return { before, after, stored };
  }

  /**
   * Creates the Firebase Auth account (or attaches the staff role to an
   * existing one — the same person can be a customer/creator elsewhere,
   * §17.1's shared identity root), provisions `users`/`staffProfiles`,
   * and returns a real, single-use password-reset link. Also attempts to
   * email that link (§ Notification breadth), but the link is always
   * returned too — invitation never silently depends on email being
   * configured.
   */
  async inviteStaff(
    businessId: string,
    input: { email: string; displayName: string; role: StaffRole; department: string; permissions?: string[]; template?: string | null },
    actor: StaffActor,
  ): Promise<{ uid: string; resetLink: string; emailAttempted: boolean }> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!EMAIL_PATTERN.test(email)) {
      throw new StaffValidationError('"email" must be a valid email address.');
    }
    if (displayName.length === 0) {
      throw new StaffValidationError('"displayName" is required.');
    }
    if (!STAFF_ROLES.includes(input.role)) {
      throw new StaffValidationError(`"role" must be one of: ${STAFF_ROLES.join(', ')}.`);
    }
    if (input.department.trim().length === 0) {
      throw new StaffValidationError('"department" is required.');
    }
    const permissions = input.permissions ?? [];
    validatePermissions(permissions);
    const template = input.template ?? null;
    if (template !== null && !findTemplate(template)) {
      throw new StaffValidationError(`Unknown role template "${template}".`);
    }
    if (input.role === 'super_admin' && !isSuperAdminActor(actor)) {
      throw new SuperAdminOnlyError('invite a super admin');
    }
    // Starting access: the chosen template, or everything the role allows (narrowed by legacy sections).
    assertWithinActor(actor, [], effectivePermissions({ roles: [input.role], template, legacySections: permissions }));

    let uid: string;
    let isNewUser: boolean;
    let existingRoles: Role[] = [];
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
      isNewUser = false;
      const existingProfile = await staffRepository.findById(uid);
      if (existingProfile) {
        throw new StaffAlreadyExistsError(email);
      }
      const existingUser = await userRepository.findById(uid);
      existingRoles = existingUser?.roles ?? [];
    } catch (error) {
      if (error instanceof StaffAlreadyExistsError) {
        throw error;
      }
      // auth/user-not-found — genuinely new account.
      const created = await adminAuth.createUser({
        email,
        displayName,
        password: crypto.randomBytes(24).toString('hex'), // never used to sign in — reset link is the real credential
      });
      uid = created.uid;
      isNewUser = true;
    }

    const roles: Role[] = Array.from(new Set([...existingRoles, input.role]));
    await adminAuth.setCustomUserClaims(uid, { roles, businessId });

    if (isNewUser) {
      await userRepository.create(uid, { email, roles, displayName, photoURL: null }, actor.uid);
    } else {
      // Upgrading an existing (e.g. customer/creator, or a previously
      // *removed* staffer being re-invited) account — never overwrite
      // their identity doc, just extend its roles. `updateRoles` also
      // clears `deletedAt`, and re-enabling the Auth account here
      // covers the other half of undoing `removeStaff()` — without
      // both, a re-invited former staffer gets either a permanent
      // "not provisioned as staff" error or an `auth/user-disabled`
      // failure before they even reach that check.
      await userRepository.updateRoles(uid, roles, actor.uid);
      await adminAuth.updateUser(uid, { disabled: false });
    }
    await staffRepository.create(uid, { businessId, role: input.role, permissions, department: input.department.trim() }, actor.uid);
    if (template !== null) {
      await staffRepository.update(uid, { template, grantedPermissions: [], revokedPermissions: [] }, actor.uid);
    }

    const resetLink = await generateStaffPasswordLink(email);

    let emailAttempted = false;
    try {
      await notificationService.send(businessId, {
        channel: 'email',
        templateCode: 'staff_invited_email',
        recipientType: 'staff',
        recipientId: uid,
        recipientRef: email,
        params: { displayName, role: input.role, resetLink },
        dedupeKey: `staff-invite:${uid}`,
      });
      emailAttempted = true;
    } catch {
      // Real send failures are already recorded on the outboundMessage
      // itself (NotificationService swallows dispatch errors) — the
      // reset link returned below is the guaranteed path regardless.
    }

    return { uid, resetLink, emailAttempted };
  }

  /** Returns the role it replaced, for the audit entry. */
  async changeRole(businessId: string, uid: string, role: StaffRole, actor: StaffActor): Promise<{ before: StaffRole }> {
    if (!STAFF_ROLES.includes(role)) {
      throw new StaffValidationError(`"role" must be one of: ${STAFF_ROLES.join(', ')}.`);
    }
    const profile = await this.requireProfile(businessId, uid);
    if (uid === actor.uid) {
      throw new CannotModifySelfError('change your own role');
    }
    if ((role === 'super_admin' || profile.role === 'super_admin') && !isSuperAdminActor(actor)) {
      throw new SuperAdminOnlyError(role === 'super_admin' ? 'make someone a super admin' : "change a super admin's role");
    }
    if (profile.role === 'super_admin' && role !== 'super_admin') {
      await this.assertNotLastSuperAdmin(businessId, uid);
    }
    const user = await userRepository.findById(uid);
    const isStaffRole = (r: Role): r is StaffRole => (STAFF_ROLES as Role[]).includes(r);
    const currentRoles: Role[] = user?.roles ?? [profile.role];
    const nextRoles: Role[] = Array.from(new Set([...currentRoles.filter((r) => !isStaffRole(r)), role]));
    assertWithinActor(actor, accessOf(currentRoles, profile).effectivePermissions, accessOf(nextRoles, profile).effectivePermissions);

    await staffRepository.update(uid, { role }, actor.uid);
    if (user) {
      await userRepository.updateRoles(uid, nextRoles, actor.uid);
      await adminAuth.setCustomUserClaims(uid, { roles: nextRoles, businessId });
    }
    return { before: profile.role };
  }

  /**
   * Restricts (or unrestricts) which Admin Portal sections a staff
   * member can reach (§ Staff access control) — an empty array means
   * unrestricted, the same default every account already had. Applies
   * to any role without complaint: it's simply a no-op for
   * `super_admin` (always unrestricted regardless, per
   * `canAccessAdminSection`) and for `agent`/`warehouse`/`finance`
   * (they never reach the Admin Portal these sections gate at all).
   */
  async changePermissions(businessId: string, uid: string, permissions: string[], actor: StaffActor): Promise<void> {
    validatePermissions(permissions);
    const profile = await this.requireProfile(businessId, uid);
    if (uid === actor.uid) {
      throw new CannotModifySelfError('change your own access');
    }
    const roles = (await userRepository.findById(uid))?.roles ?? [profile.role];
    // An empty list means "every section": clearing someone's limits is a grant like any other.
    assertWithinActor(actor, accessOf(roles, profile).effectivePermissions, accessOf(roles, { ...profile, permissions }).effectivePermissions);
    await staffRepository.update(uid, { permissions }, actor.uid);
  }

  async setDisabled(businessId: string, uid: string, disabled: boolean, actor: StaffActor): Promise<void> {
    const profile = await this.requireProfile(businessId, uid);
    if (uid === actor.uid) {
      throw new CannotModifySelfError(disabled ? 'disable' : 'reactivate');
    }
    if (profile.role === 'super_admin' && !isSuperAdminActor(actor)) {
      throw new SuperAdminOnlyError(disabled ? 'disable a super admin' : 'reactivate a super admin');
    }
    if (disabled && profile.role === 'super_admin') {
      await this.assertNotLastSuperAdmin(businessId, uid);
    }
    await adminAuth.updateUser(uid, { disabled });
  }

  async removeStaff(businessId: string, uid: string, actor: StaffActor): Promise<void> {
    const profile = await this.requireProfile(businessId, uid);
    if (uid === actor.uid) {
      throw new CannotModifySelfError('remove');
    }
    if (profile.role === 'super_admin') {
      if (!isSuperAdminActor(actor)) {
        throw new SuperAdminOnlyError('remove a super admin');
      }
      await this.assertNotLastSuperAdmin(businessId, uid);
    }
    await staffRepository.softDelete(uid, actor.uid);
    await userRepository.softDelete(uid, actor.uid);
    await adminAuth.updateUser(uid, { disabled: true });
  }

  /**
   * A reset link is a way into the account, so it is only handed to
   * someone who already holds everything that account can do: a super
   * admin's only by another super admin, anyone else's only by someone
   * whose access covers theirs.
   */
  async resetPassword(businessId: string, uid: string, actor: StaffActor): Promise<{ resetLink: string }> {
    const user = await userRepository.findById(uid);
    const profile = await this.requireProfile(businessId, uid);
    if (!user) {
      throw new StaffNotFoundError(uid);
    }
    if ((profile.role === 'super_admin' || user.roles.includes('super_admin')) && !isSuperAdminActor(actor)) {
      throw new SuperAdminOnlyError("reset a super admin's password");
    }
    assertWithinActor(actor, [], accessOf(user.roles, profile).effectivePermissions);
    const resetLink = await generateStaffPasswordLink(user.email);
    return { resetLink };
  }

  private async requireProfile(businessId: string, uid: string) {
    const profile = await staffRepository.findById(uid);
    if (!profile || profile.businessId !== businessId) {
      throw new StaffNotFoundError(uid);
    }
    return profile;
  }

  private async assertNotLastSuperAdmin(businessId: string, excludingUid: string): Promise<void> {
    const staff = await staffRepository.listByBusiness(businessId);
    const otherSuperAdmins = staff.filter((s) => s.id !== excludingUid && s.data.role === 'super_admin');
    if (otherSuperAdmins.length === 0) {
      throw new LastSuperAdminError();
    }
  }
}

export const staffManagementService = new StaffManagementService();
export { StaffManagementService };

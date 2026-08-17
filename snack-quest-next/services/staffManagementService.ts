import 'server-only';

import crypto from 'node:crypto';
import { adminAuth } from '@/lib/firebase/admin';
import { staffRepository } from '@/repositories/staffRepository';
import { userRepository } from '@/repositories/userRepository';
import { notificationService } from '@/services/notificationService';
import { isAdminSection } from '@/lib/auth/adminSections';
import type { Role, StaffRole } from '@/types';

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
      };
    });
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
    input: { email: string; displayName: string; role: StaffRole; department: string; permissions?: string[] },
    actor: string,
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
      await userRepository.create(uid, { email, roles, displayName, photoURL: null }, actor);
    } else {
      // Upgrading an existing (e.g. customer/creator) account — never
      // overwrite their identity doc, just extend its roles.
      await userRepository.updateRoles(uid, roles, actor);
    }
    await staffRepository.create(uid, { businessId, role: input.role, permissions, department: input.department.trim() }, actor);

    const resetLink = await adminAuth.generatePasswordResetLink(email);

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

  async changeRole(businessId: string, uid: string, role: StaffRole, actor: string): Promise<void> {
    if (!STAFF_ROLES.includes(role)) {
      throw new StaffValidationError(`"role" must be one of: ${STAFF_ROLES.join(', ')}.`);
    }
    const profile = await this.requireProfile(businessId, uid);
    if (uid === actor) {
      throw new CannotModifySelfError('change your own role');
    }
    if (profile.role === 'super_admin' && role !== 'super_admin') {
      await this.assertNotLastSuperAdmin(businessId, uid);
    }

    await staffRepository.update(uid, { role }, actor);
    const user = await userRepository.findById(uid);
    if (user) {
      const isStaffRole = (r: Role): r is StaffRole => (STAFF_ROLES as Role[]).includes(r);
      const roles: Role[] = Array.from(new Set([...user.roles.filter((r) => !isStaffRole(r)), role]));
      await userRepository.updateRoles(uid, roles, actor);
      await adminAuth.setCustomUserClaims(uid, { roles, businessId });
    }
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
  async changePermissions(businessId: string, uid: string, permissions: string[], actor: string): Promise<void> {
    validatePermissions(permissions);
    await this.requireProfile(businessId, uid);
    await staffRepository.update(uid, { permissions }, actor);
  }

  async setDisabled(businessId: string, uid: string, disabled: boolean, actor: string): Promise<void> {
    await this.requireProfile(businessId, uid);
    if (uid === actor) {
      throw new CannotModifySelfError(disabled ? 'disable' : 'reactivate');
    }
    if (disabled) {
      const profile = await this.requireProfile(businessId, uid);
      if (profile.role === 'super_admin') {
        await this.assertNotLastSuperAdmin(businessId, uid);
      }
    }
    await adminAuth.updateUser(uid, { disabled });
  }

  async removeStaff(businessId: string, uid: string, actor: string): Promise<void> {
    const profile = await this.requireProfile(businessId, uid);
    if (uid === actor) {
      throw new CannotModifySelfError('remove');
    }
    if (profile.role === 'super_admin') {
      await this.assertNotLastSuperAdmin(businessId, uid);
    }
    await staffRepository.softDelete(uid, actor);
    await userRepository.softDelete(uid, actor);
    await adminAuth.updateUser(uid, { disabled: true });
  }

  async resetPassword(businessId: string, uid: string): Promise<{ resetLink: string }> {
    const user = await userRepository.findById(uid);
    await this.requireProfile(businessId, uid);
    if (!user) {
      throw new StaffNotFoundError(uid);
    }
    const resetLink = await adminAuth.generatePasswordResetLink(user.email);
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

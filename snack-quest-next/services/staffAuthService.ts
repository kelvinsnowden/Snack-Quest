import 'server-only';

import { adminAuth } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { staffRepository } from '@/repositories/staffRepository';
import type { Role } from '@/types';

/**
 * Owns the staff/admin login handshake (§ Admin auth foundation): a
 * Firebase ID token proves *who* signed in, but only a matching
 * `users/{uid}` + `staffProfiles/{uid}` pair proves they're actually
 * provisioned staff — nobody self-registers into the Admin Portal.
 * Staff accounts are created by `scripts/seedStaff.mjs` today (same
 * seed-script-only provisioning as `businesses`, deliberately — see
 * PLATFORM_ARCHITECTURE_V2.md §17.3) or, later, an admin-only "invite
 * staff" flow — never by a client-writable path.
 *
 * Every session establishment re-syncs the Auth custom claims from
 * Firestore rather than trusting whatever claims the ID token already
 * carries — Firestore stays the single source of truth for a staff
 * member's roles/business, so a role change or deactivation takes
 * effect on their very next login without waiting for a claim to
 * expire.
 */

const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export class StaffNotProvisionedError extends Error {
  constructor(uid: string) {
    super(`${uid} authenticated but has no staff account provisioned`);
    this.name = 'StaffNotProvisionedError';
  }
}

export interface StaffSession {
  uid: string;
  email: string;
  displayName: string;
  roles: Role[];
  businessId: string;
  /** Which Admin Portal sections this staff member can reach (§ Staff access control) — empty means unrestricted. See `lib/auth/adminSections.ts`. */
  permissions: string[];
}

class StaffAuthService {
  /**
   * Verifies the client-supplied ID token, confirms the uid is
   * provisioned staff, re-syncs custom claims from Firestore, and
   * mints a session cookie. Never called directly by a route — the
   * route only owns the HTTP mechanics of setting the returned cookie.
   */
  async establishSession(idToken: string): Promise<{ cookie: string; maxAgeMs: number; session: StaffSession }> {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const [user, staffProfile] = await Promise.all([
      userRepository.findById(decoded.uid),
      staffRepository.findById(decoded.uid),
    ]);

    if (!user || user.deletedAt || !staffProfile) {
      throw new StaffNotProvisionedError(decoded.uid);
    }

    await adminAuth.setCustomUserClaims(decoded.uid, {
      roles: user.roles,
      businessId: staffProfile.businessId,
    });

    const cookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });

    return {
      cookie,
      maxAgeMs: SESSION_MAX_AGE_MS,
      session: {
        uid: decoded.uid,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        businessId: staffProfile.businessId,
        permissions: staffProfile.permissions,
      },
    };
  }

  /**
   * The "Secure" tier check (Next.js's own Optimistic/Secure
   * distinction — proxy.ts only does the cheap Optimistic half): full
   * session-cookie verification against Firebase Auth plus a fresh
   * Firestore read, so a deactivated staff account or a revoked
   * session is rejected immediately, not just once the cookie expires.
   */
  async verifySessionCookie(cookie: string): Promise<StaffSession | null> {
    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(cookie, true);
    } catch {
      return null;
    }

    const [user, staffProfile] = await Promise.all([
      userRepository.findById(decoded.uid),
      staffRepository.findById(decoded.uid),
    ]);
    if (!user || user.deletedAt || !staffProfile) {
      return null;
    }

    return {
      uid: decoded.uid,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      businessId: staffProfile.businessId,
      permissions: staffProfile.permissions,
    };
  }
}

export const staffAuthService = new StaffAuthService();
export { SESSION_MAX_AGE_MS };

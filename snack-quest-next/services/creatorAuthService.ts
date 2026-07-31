import 'server-only';

import { adminAuth } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { generateUniqueReferralCode } from '@/lib/creators/referralCode';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { publishEvent } from '@/lib/events/eventBus';
import type { CreatorStatus, User } from '@/types';

/**
 * Owns the Creator Portal's own sign-up/sign-in handshake (§ Creator
 * Portal auth) — unlike staff, creators genuinely self-register
 * (TDD §4.2), but `firestore.rules` still blocks a client from
 * creating `creatorProfiles/{uid}` directly (`allow create: if
 * false`) and from self-granting the `creator` role on `users/{uid}`
 * (client self-create there is pinned to `roles == ['customer']`).
 * So the real account (Firebase Auth) is created client-side —
 * that's plain Firebase Auth and always allowed — but the two
 * Firestore documents that actually grant creator access only ever
 * get written here, via the Admin SDK, after verifying the ID token
 * that Auth account produced.
 *
 * `register()` is idempotent on `creatorProfiles/{uid}` existence
 * rather than on the Firebase Auth account: that's what lets a
 * customer who already has a `users/{uid}` doc (from ordering over
 * WhatsApp) join the creator program without a second account (TDD
 * §7's multi-role handling), and it's also what makes a partial
 * failure recoverable — a client that created the Auth account but
 * never got a 200 back can safely resubmit the same idToken.
 */

const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days, matches staff sessions

export class CreatorAlreadyRegisteredError extends Error {
  constructor(uid: string) {
    super(`${uid} already has a creator profile`);
    this.name = 'CreatorAlreadyRegisteredError';
  }
}

export class InvalidCreatorRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCreatorRegistrationError';
  }
}

export class CreatorNotProvisionedError extends Error {
  constructor(uid: string) {
    super(`${uid} authenticated but has no creator account provisioned`);
    this.name = 'CreatorNotProvisionedError';
  }
}

export interface CreatorSession {
  uid: string;
  email: string;
  displayName: string;
  businessId: string;
  status: CreatorStatus;
  onboardingCompleted: boolean;
}

function toSession(uid: string, user: User, profile: { businessId: string; status: CreatorStatus; onboardingCompleted: boolean }): CreatorSession {
  return {
    uid,
    email: user.email,
    displayName: user.displayName,
    businessId: profile.businessId,
    status: profile.status,
    onboardingCompleted: profile.onboardingCompleted,
  };
}

class CreatorAuthService {
  async register(idToken: string, displayName: string): Promise<{ cookie: string; maxAgeMs: number; session: CreatorSession }> {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      throw new InvalidCreatorRegistrationError('Display name is required');
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const businessId = getCurrentBusinessId();

    const existingProfile = await creatorRepository.findById(decoded.uid);
    if (existingProfile) {
      throw new CreatorAlreadyRegisteredError(decoded.uid);
    }

    const existingUser = await userRepository.findById(decoded.uid);
    const roles: User['roles'] = existingUser
      ? [...new Set([...existingUser.roles, 'creator' as const])]
      : ['creator'];

    if (existingUser) {
      if (!existingUser.roles.includes('creator')) {
        await userRepository.updateRoles(decoded.uid, roles, decoded.uid);
      }
    } else {
      await userRepository.create(
        decoded.uid,
        {
          email: decoded.email ?? '',
          roles,
          displayName: trimmedName,
          photoURL: null,
        },
        decoded.uid,
      );
    }

    const referralCode = await generateUniqueReferralCode(businessId, trimmedName);
    await creatorRepository.create(decoded.uid, {
      businessId,
      referralCode,
      tier: 'bronze',
      availableCashKes: 0,
      pendingEarningsKes: 0,
      lifetimeEarningsKes: 0,
      totalClicks: 0,
      totalConversions: 0,
      bio: '',
      niche: '',
      followersRange: '',
      paymentPreference: 'mpesa',
      payoutPhoneNumber: null,
      socialHandles: {},
      onboardingCompleted: false,
      status: 'pending',
      schemaVersion: 1,
    });

    await adminAuth.setCustomUserClaims(decoded.uid, { roles, businessId });
    await publishEvent(businessId, 'CreatorRegistered', 'creatorProfile', decoded.uid, { referralCode });

    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });

    return {
      cookie,
      maxAgeMs: SESSION_MAX_AGE_MS,
      session: {
        uid: decoded.uid,
        email: existingUser?.email ?? decoded.email ?? '',
        displayName: existingUser?.displayName ?? trimmedName,
        businessId,
        status: 'pending',
        onboardingCompleted: false,
      },
    };
  }

  async login(idToken: string): Promise<{ cookie: string; maxAgeMs: number; session: CreatorSession }> {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const [user, profile] = await Promise.all([
      userRepository.findById(decoded.uid),
      creatorRepository.findById(decoded.uid),
    ]);

    if (!user || user.deletedAt || !profile) {
      throw new CreatorNotProvisionedError(decoded.uid);
    }

    await adminAuth.setCustomUserClaims(decoded.uid, { roles: user.roles, businessId: profile.businessId });
    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });

    return {
      cookie,
      maxAgeMs: SESSION_MAX_AGE_MS,
      session: toSession(decoded.uid, user, profile),
    };
  }

  /** The Secure tier check — same shape as `StaffAuthService.verifySessionCookie` (see that file for why this re-reads Firestore instead of trusting the cookie's own claims). */
  async verifySessionCookie(cookie: string): Promise<CreatorSession | null> {
    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(cookie, true);
    } catch {
      return null;
    }

    const [user, profile] = await Promise.all([
      userRepository.findById(decoded.uid),
      creatorRepository.findById(decoded.uid),
    ]);
    if (!user || user.deletedAt || !profile) {
      return null;
    }

    return toSession(decoded.uid, user, profile);
  }
}

export const creatorAuthService = new CreatorAuthService();
export { SESSION_MAX_AGE_MS as CREATOR_SESSION_MAX_AGE_MS };

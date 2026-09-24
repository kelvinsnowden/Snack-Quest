import 'server-only';

import { adminAuth } from '@/lib/firebase/admin';
import { partnerRepository } from '@/repositories/partnerRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import type { Partner } from '@/types';

/**
 * The Owner Portal's own sign-up/sign-in handshake (§ PART 2 — OWNER
 * PORTAL, § PART 8 — SECURITY), the same shape as
 * `services/creatorAuthService.ts` for exactly the same reason: the
 * real account is plain Firebase Auth, created client-side, and this
 * service is the only place an ID token from that account becomes
 * something that can actually read a partner's own data.
 *
 * The one real difference from the Creator Portal: a creator
 * genuinely self-registers from nothing, but a partner always exists
 * first — staff create the `Partner` record (with `contactEmail`)
 * once the commercial relationship (machine purchase) is real.
 * `register()` here is a *claim*, not a creation: it links a fresh
 * Firebase Auth account to the one unclaimed partner record whose
 * `contactEmail` matches, and never invents a new partner or lets an
 * account claim a partner someone else already claimed.
 */

export class PartnerNotProvisionedError extends Error {
  constructor(identity: string) {
    super(`${identity} has no partner account to sign in to`);
    this.name = 'PartnerNotProvisionedError';
  }
}

export class PartnerAlreadyClaimedError extends Error {
  constructor(email: string) {
    super(`No unclaimed partner account found for ${email} — it may already be claimed by another sign-in`);
    this.name = 'PartnerAlreadyClaimedError';
  }
}

const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days, matches staff/creator sessions

export interface PartnerSession {
  uid: string;
  partnerId: string;
  businessId: string;
  name: string;
  contactEmail: string | null;
  status: Partner['status'];
}

function toSession(uid: string, partnerId: string, partner: Partner): PartnerSession {
  return {
    uid,
    partnerId,
    businessId: partner.businessId,
    name: partner.name,
    contactEmail: partner.contactEmail,
    status: partner.status,
  };
}

class PartnerAuthService {
  /** Claims the one unclaimed partner record matching this Firebase Auth account's email — see this file's own doc comment for why this is a claim, not a creation. */
  async register(idToken: string): Promise<{ cookie: string; maxAgeMs: number; session: PartnerSession }> {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const businessId = getCurrentBusinessId();
    const email = decoded.email ?? '';
    if (!email) {
      throw new PartnerNotProvisionedError(decoded.uid);
    }

    const existingByUid = await partnerRepository.findByAuthUid(businessId, decoded.uid);
    if (existingByUid) {
      // Already claimed by this exact account on an earlier call — idempotent, not an error.
      const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
      return { cookie, maxAgeMs: SESSION_MAX_AGE_MS, session: toSession(decoded.uid, existingByUid.id, existingByUid.data) };
    }

    const unclaimed = await partnerRepository.findUnclaimedByContactEmail(businessId, email);
    if (!unclaimed) {
      throw new PartnerAlreadyClaimedError(email);
    }

    await partnerRepository.linkAuthUid(unclaimed.id, decoded.uid);
    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    return {
      cookie,
      maxAgeMs: SESSION_MAX_AGE_MS,
      session: toSession(decoded.uid, unclaimed.id, { ...unclaimed.data, authUid: decoded.uid }),
    };
  }

  async login(idToken: string): Promise<{ cookie: string; maxAgeMs: number; session: PartnerSession }> {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const businessId = getCurrentBusinessId();
    const found = await partnerRepository.findByAuthUid(businessId, decoded.uid);
    if (!found || found.data.deletedAt) {
      throw new PartnerNotProvisionedError(decoded.uid);
    }

    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    return { cookie, maxAgeMs: SESSION_MAX_AGE_MS, session: toSession(decoded.uid, found.id, found.data) };
  }

  /** The Secure-tier check — same shape as `CreatorAuthService.verifySessionCookie`: re-reads Firestore rather than trusting the cookie's own claims, so a revoked/suspended partner loses access on its very next request. */
  async verifySessionCookie(cookie: string): Promise<PartnerSession | null> {
    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(cookie, true);
    } catch {
      return null;
    }

    const businessId = getCurrentBusinessId();
    const found = await partnerRepository.findByAuthUid(businessId, decoded.uid);
    if (!found || found.data.deletedAt || found.data.status !== 'active') {
      return null;
    }
    return toSession(decoded.uid, found.id, found.data);
  }
}

export const partnerAuthService = new PartnerAuthService();
export { SESSION_MAX_AGE_MS as PARTNER_SESSION_MAX_AGE_MS };

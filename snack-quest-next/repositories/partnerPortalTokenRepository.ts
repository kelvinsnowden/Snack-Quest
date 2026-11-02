import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

const COLLECTION = 'partnerPortalTokens';

/** Why the link was sent: the first invitation, or a new password asked for later. */
export type PartnerPortalTokenPurpose = 'invite' | 'reset';

/**
 * `partnerPortalTokens/{sha256(token)}` — a one-time link to set an owner's
 * Owner Portal password. Stored under the token's hash, so the database never
 * holds a usable link; the token itself exists only in the owner's email.
 */
export interface PartnerPortalToken {
  businessId: string;
  partnerId: string;
  /** The Firebase Auth login the password is set on. */
  uid: string;
  email: string;
  purpose: PartnerPortalTokenPurpose;
  expiresAt: Timestamp;
  usedAt: Timestamp | null;
  createdAt: Timestamp;
  /** The staff member who sent it, or `owner` when they asked for it themselves. */
  createdBy: string;
}

class PartnerPortalTokenRepository {
  async create(tokenHash: string, token: Omit<PartnerPortalToken, 'usedAt' | 'createdAt'>): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(tokenHash).set({ ...token, usedAt: null, createdAt: FieldValue.serverTimestamp() });
  }

  async find(tokenHash: string): Promise<PartnerPortalToken | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(tokenHash).get();
    return snapshot.exists ? (snapshot.data() as PartnerPortalToken) : null;
  }

  /** Marks the link used. False when it was already used, so a link sets a password once. */
  async markUsed(tokenHash: string): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(tokenHash);
    return adminFirestore.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() as PartnerPortalToken | undefined;
      if (!data || data.usedAt) return false;
      tx.update(ref, { usedAt: Timestamp.now() });
      return true;
    });
  }
}

export const partnerPortalTokenRepository = new PartnerPortalTokenRepository();

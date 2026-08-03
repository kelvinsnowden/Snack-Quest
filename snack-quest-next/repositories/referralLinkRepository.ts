import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, ReferralLink } from '@/types';

const COLLECTION = 'referralLinks';

export type ReferralLinkInput = Omit<ReferralLink, keyof AuditFields>;

/** The conversion side of a referral link's counters (§ Creator Portal referral links) — incremented in the same transaction as `ReferralService.awardCommission()`'s other writes. */
export function incrementConversionCountInTransaction(
  tx: Transaction,
  linkId: string,
): void {
  tx.update(adminFirestore.collection(COLLECTION).doc(linkId), {
    conversionCount: FieldValue.increment(1),
  });
}

/** Same shape as `ReferralLinkRepository.create()`, but as part of the caller's transaction (§ referral system overhaul) — used by `CreatorAuthService.register()` so a creator's one permanent link is created atomically with their profile, never leaving a profile with no link or a link with no profile. */
export function createInTransaction(
  tx: Transaction,
  input: ReferralLinkInput,
  actor: string,
): string {
  const ref = adminFirestore.collection(COLLECTION).doc();
  const now = FieldValue.serverTimestamp();
  tx.set(ref, {
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    deletedAt: null,
  });
  return ref.id;
}

class ReferralLinkRepository {
  /**
   * Scoped by `businessId` — a referral code is only unique within one
   * tenant. Two businesses' creators could both hand out "SAVE10".
   */
  async findByCode(
    businessId: string,
    code: string,
  ): Promise<{ id: string; data: ReferralLink } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('code', '==', code)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as ReferralLink };
  }

  /** Unscoped by `isActive` — a retired code still shouldn't be silently reused for a different creator. */
  async existsByCode(businessId: string, code: string): Promise<boolean> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('code', '==', code)
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  /** § Creator Portal referral links — a creator's own links, newest first. */
  async listByOwner(
    businessId: string,
    ownerId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    links: { id: string; data: ReferralLink }[];
    nextCursor: string | null;
  }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('ownerId', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await adminFirestore
        .collection(COLLECTION)
        .doc(options.cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      links: docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as ReferralLink,
      })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  /** § app/r/[code]/route.ts — a real click-through, outside any larger transaction. */
  async incrementClickCount(linkId: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(linkId)
      .update({ clickCount: FieldValue.increment(1) });
  }

  async findById(
    businessId: string,
    linkId: string,
  ): Promise<ReferralLink | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(linkId)
      .get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as ReferralLink;
    return data.businessId === businessId ? data : null;
  }

  async create(input: ReferralLinkInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }

  async update(
    linkId: string,
    patch: Partial<ReferralLinkInput>,
    actor: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(linkId)
      .update({
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }

  /** Admin: Referrals (§ Admin: Referrals) — every link for the business, newest first. */
  async listByBusiness(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    links: { id: string; data: ReferralLink }[];
    nextCursor: string | null;
  }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await adminFirestore
        .collection(COLLECTION)
        .doc(options.cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      links: docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as ReferralLink,
      })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const referralLinkRepository = new ReferralLinkRepository();

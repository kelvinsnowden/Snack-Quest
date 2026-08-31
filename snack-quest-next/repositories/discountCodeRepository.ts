import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { normalizeDiscountCode, rejectionFor } from '@/lib/checkout/discountCode';
import type { DiscountCode, DiscountCodeRejection } from '@/types/discountCode';

const COLLECTION = 'discountCodes';

/**
 * Storage for discount codes (§ discount codes).
 *
 * The document id is `{businessId}:{CODE}`. A composed id rather than a
 * random one with a `where` clause, because looking a code up is what
 * this collection does on every keystroke of the checkout's code field,
 * and a document read is both cheaper and free of the eventual
 * consistency a query can show. It also makes the uniqueness this needs
 * a property of the database rather than of a check somebody remembers
 * to run.
 */
function docId(businessId: string, code: string): string {
  return `${businessId}:${normalizeDiscountCode(code)}`;
}

export interface DiscountCodeInput {
  businessId: string;
  code: string;
  kind: 'percentage' | 'fixed';
  value: number;
  waivesDelivery: boolean;
  maxRedemptions: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  note: string | null;
  createdBy: string;
}

class DiscountCodeRepository {
  async create(input: DiscountCodeInput): Promise<{ created: boolean; reason?: string }> {
    const code = normalizeDiscountCode(input.code);
    const ref = adminFirestore.collection(COLLECTION).doc(docId(input.businessId, code));

    try {
      // `create` rather than `set`: two staff members adding the same
      // code at once should be one code and one error, not a silent
      // overwrite of whichever settings were saved first.
      await ref.create({
        businessId: input.businessId,
        code,
        kind: input.kind,
        value: input.value,
        waivesDelivery: input.waivesDelivery,
        maxRedemptions: input.maxRedemptions,
        redemptionCount: 0,
        startsAt: input.startsAt ? Timestamp.fromDate(input.startsAt) : null,
        expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
        isActive: input.isActive,
        note: input.note,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });
      return { created: true };
    } catch (error) {
      if ((error as { code?: number }).code === 6) {
        return { created: false, reason: `Code ${code} already exists.` };
      }
      throw error;
    }
  }

  async findByCode(businessId: string, code: string): Promise<DiscountCode | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(docId(businessId, code))
      .get();
    return snapshot.exists ? (snapshot.data() as DiscountCode) : null;
  }

  async listByBusiness(businessId: string, limit = 200): Promise<DiscountCode[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .limit(limit)
      .get();
    // Sorted here rather than by Firestore: an `orderBy` alongside the
    // `where` would need a composite index, and a missing one fails at
    // request time. The list is bounded and small.
    return snapshot.docs
      .map((doc) => doc.data() as DiscountCode)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }

  async update(
    businessId: string,
    code: string,
    patch: Partial<
      Pick<
        DiscountCodeInput,
        'value' | 'waivesDelivery' | 'maxRedemptions' | 'expiresAt' | 'startsAt' | 'isActive' | 'note'
      >
    >,
    updatedBy: string,
  ): Promise<void> {
    const writable: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy };
    if (patch.value !== undefined) writable.value = patch.value;
    if (patch.waivesDelivery !== undefined) writable.waivesDelivery = patch.waivesDelivery;
    if (patch.maxRedemptions !== undefined) writable.maxRedemptions = patch.maxRedemptions;
    if (patch.isActive !== undefined) writable.isActive = patch.isActive;
    if (patch.note !== undefined) writable.note = patch.note;
    if (patch.startsAt !== undefined) {
      writable.startsAt = patch.startsAt ? Timestamp.fromDate(patch.startsAt) : null;
    }
    if (patch.expiresAt !== undefined) {
      writable.expiresAt = patch.expiresAt ? Timestamp.fromDate(patch.expiresAt) : null;
    }
    // `redemptionCount` is deliberately not patchable. It is a record of
    // what happened, not a setting.
    await adminFirestore.collection(COLLECTION).doc(docId(businessId, code)).update(writable);
  }

  /**
   * Claims one redemption, or refuses.
   *
   * A transaction, and this is the whole reason the counter lives on the
   * document rather than being derived by counting orders. A code handed
   * to one influencer is `maxRedemptions: 1`, and a read-then-write would
   * let two simultaneous checkouts both read zero and both proceed —
   * giving away two boxes against a limit of one. Under a transaction the
   * second attempt re-reads the incremented count and is refused.
   *
   * Claimed at the point the price is frozen rather than when the order
   * completes, because between those two moments the customer is holding
   * a promise at that price. A limited code that let ten people reach the
   * M-Pesa prompt and then honoured one would be worse than refusing
   * nine of them a minute earlier.
   */
  async claimRedemption(
    businessId: string,
    code: string,
    now: Date = new Date(),
  ): Promise<{ claimed: true; discount: DiscountCode } | { claimed: false; reason: DiscountCodeRejection }> {
    const ref = adminFirestore.collection(COLLECTION).doc(docId(businessId, code));

    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const discount = snapshot.exists ? (snapshot.data() as DiscountCode) : null;

      const rejection = rejectionFor(discount, now);
      if (rejection || !discount) {
        return { claimed: false as const, reason: rejection ?? ('not_found' as const) };
      }

      tx.update(ref, {
        redemptionCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { claimed: true as const, discount };
    });
  }

  /**
   * Hands a redemption back.
   *
   * Called when an order that claimed one never happened, so a code
   * limited to a single use is not spent by a customer who abandoned the
   * M-Pesa prompt. Floors at zero: a double release must not leave a
   * code with negative usage, which would silently raise its limit.
   */
  async releaseRedemption(businessId: string, code: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(docId(businessId, code));
    await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        return;
      }
      const current = (snapshot.data() as DiscountCode).redemptionCount ?? 0;
      tx.update(ref, {
        redemptionCount: Math.max(current - 1, 0),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
}

export const discountCodeRepository = new DiscountCodeRepository();

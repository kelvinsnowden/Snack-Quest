import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, CreatorProfile, CreatorStatus } from '@/types';

export class CreatorProfileNotFoundError extends Error {
  constructor(uid: string) {
    super(`No creator profile found for uid ${uid}`);
    this.name = 'CreatorProfileNotFoundError';
  }
}

export class InsufficientCreatorBalanceError extends Error {
  constructor(uid: string, requested: number, available: number) {
    super(
      `Creator ${uid} has only ${available} available, cannot reserve ${requested}`,
    );
    this.name = 'InsufficientCreatorBalanceError';
  }
}

/**
 * Reserves `amountKes` of a creator's `availableCashKes` inside the
 * caller's transaction — used by `WithdrawalService.requestWithdrawal()`
 * so a creator can never request more than they actually have, and
 * can never double-spend the same balance across two concurrent
 * requests (the read-check-decrement all happens atomically here, not
 * as a separate check before the transaction).
 */
export async function reserveBalanceInTransaction(
  tx: Transaction,
  creatorId: string,
  amountKes: number,
): Promise<void> {
  const ref = adminFirestore.collection('creatorProfiles').doc(creatorId);
  const snapshot = await tx.get(ref);
  const data = snapshot.data() as CreatorProfile | undefined;
  if (!data) {
    throw new CreatorProfileNotFoundError(creatorId);
  }
  if (data.availableCashKes < amountKes) {
    throw new InsufficientCreatorBalanceError(
      creatorId,
      amountKes,
      data.availableCashKes,
    );
  }
  tx.update(ref, { availableCashKes: FieldValue.increment(-amountKes) });
}

/** The reverse of `reserveBalanceInTransaction` — a rejected or failed withdrawal releases the hold back to the creator. */
export function refundBalanceInTransaction(
  tx: Transaction,
  creatorId: string,
  amountKes: number,
): void {
  const ref = adminFirestore.collection('creatorProfiles').doc(creatorId);
  tx.update(ref, { availableCashKes: FieldValue.increment(amountKes) });
}

/** The creator-level conversion counter (§ Creator Portal referral links) — incremented alongside `referralLinkRepository.incrementConversionCountInTransaction()` in the same `ReferralService.awardCommission()` transaction. */
export function incrementConversionCountInTransaction(
  tx: Transaction,
  creatorId: string,
): void {
  const ref = adminFirestore.collection('creatorProfiles').doc(creatorId);
  tx.update(ref, { totalConversions: FieldValue.increment(1) });
}

/**
 * Atomically claims the next registration slot for a business and
 * returns its 1-indexed number (§ referral system overhaul) — a
 * denormalized counter (`businesses/{businessId}/counters/creatorRegistrations`)
 * rather than counting `creatorProfiles` documents on every
 * registration, since Firestore has no native auto-increment and a
 * live `.count()` query racing two concurrent registrations could
 * hand out the same slot twice. `CreatorAuthService.register()` turns
 * this number into a permanent commission rate via
 * `lib/creators/referralEconomics.ts`'s tiers — deciding *which* tier
 * a number falls into is a business rule that belongs there, not
 * here.
 */
export async function claimNextRegistrationNumberInTransaction(
  tx: Transaction,
  businessId: string,
): Promise<number> {
  const counterRef = adminFirestore
    .collection('businesses')
    .doc(businessId)
    .collection('counters')
    .doc('creatorRegistrations');
  const snapshot = await tx.get(counterRef);
  const priorCount = snapshot.exists
    ? ((snapshot.data()?.count as number | undefined) ?? 0)
    : 0;
  const registrationNumber = priorCount + 1;
  tx.set(counterRef, { count: registrationNumber }, { merge: true });
  return registrationNumber;
}

/** Same shape as `CreatorRepository.create()`, but as part of the caller's transaction — used by `CreatorAuthService.register()` so the profile, its registration-slot claim, and its auto-generated referral link all commit atomically or not at all. */
export function createInTransaction(
  tx: Transaction,
  uid: string,
  data: CreatorProfileInput,
): void {
  const now = FieldValue.serverTimestamp();
  const ref = adminFirestore.collection('creatorProfiles').doc(uid);
  tx.set(ref, {
    ...data,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
    deletedAt: null,
  });
}

/**
 * `creatorProfiles` reads/writes (TDD §4/§8). This is the reference
 * Repository every later repository is reviewed against: persistence
 * only, no business rules, no decision about *whether* a write should
 * happen — that belongs to a Service.
 */

const COLLECTION = 'creatorProfiles';

export type CreatorProfileInput = Omit<CreatorProfile, keyof AuditFields>;

/**
 * updatedBy is required on every update — the Repository stamps
 * updatedAt automatically (a persistence mechanic), but actor identity
 * is a Service-layer concern the Repository never invents.
 */
export type CreatorProfileUpdate = Partial<CreatorProfileInput> & {
  updatedBy: string;
};

class CreatorRepository {
  async findById(uid: string): Promise<CreatorProfile | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as CreatorProfile;
  }

  async create(uid: string, data: CreatorProfileInput): Promise<void> {
    const now = FieldValue.serverTimestamp();
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .set({
        ...data,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        updatedBy: uid,
        deletedAt: null,
      });
  }

  async update(uid: string, partial: CreatorProfileUpdate): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .update({
        ...partial,
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  /** § app/r/[code]/route.ts — the creator-level aggregate, alongside the per-link `referralLinkRepository.incrementClickCount()`. */
  async incrementClickCount(uid: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .update({ totalClicks: FieldValue.increment(1) });
  }

  /** § Creator Portal auth — uniqueness check while generating a new creator's referral code; see lib/creators/referralCode.ts. */
  async existsByReferralCode(
    businessId: string,
    referralCode: string,
  ): Promise<boolean> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  /**
   * Admin: Creators (§ Admin: Creators) — real cursor pagination,
   * newest-first, optionally narrowed to one status. The filtered
   * shape (businessId + status + createdAt) needs a composite index
   * — see firestore.indexes.json; the unfiltered shape (a single
   * equality plus an orderBy on a different field) does not.
   */
  async listByBusiness(
    businessId: string,
    options: { status?: CreatorStatus; limit?: number; cursor?: string } = {},
  ): Promise<{
    creators: { id: string; data: CreatorProfile }[];
    nextCursor: string | null;
  }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);

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
      creators: docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as CreatorProfile,
      })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  /**
   * § Creator Portal leaderboards — the top `limit` active creators by
   * lifetime earnings. `active` only: a pending or suspended creator
   * hasn't really participated, matching the access-level gating
   * `CreatorDashboardService` already applies.
   */
  async listTopByBusiness(
    businessId: string,
    limit = 10,
  ): Promise<{ id: string; data: CreatorProfile }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'active')
      .orderBy('lifetimeEarningsKes', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as CreatorProfile,
    }));
  }

  /**
   * § Creator Portal leaderboards — how many active creators outrank
   * a given lifetime-earnings figure; `rank = count + 1`. A cheap
   * aggregation query (`.count()`), not a full document read of every
   * competing creator.
   */
  async countActiveAboveEarnings(
    businessId: string,
    lifetimeEarningsKes: number,
  ): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'active')
      .where('lifetimeEarningsKes', '>', lifetimeEarningsKes)
      .count()
      .get();
    return snapshot.data().count;
  }

  /** § Creator Portal leaderboards — the "#N of M" denominator. */
  async countActive(businessId: string): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'active')
      .count()
      .get();
    return snapshot.data().count;
  }
}

export const creatorRepository = new CreatorRepository();

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
  businessId: string,
  creatorId: string,
  amountKes: number,
): Promise<void> {
  const ref = creatorMembershipRef(businessId, creatorId);
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
  businessId: string,
  creatorId: string,
  amountKes: number,
): void {
  const ref = creatorMembershipRef(businessId, creatorId);
  tx.update(ref, { availableCashKes: FieldValue.increment(amountKes) });
}

/** The creator-level conversion counter (§ Creator Portal referral links) — incremented alongside `referralLinkRepository.incrementConversionCountInTransaction()` in the same `ReferralService.awardCommission()` transaction. */
export function incrementConversionCountInTransaction(
  tx: Transaction,
  businessId: string,
  creatorId: string,
): void {
  const ref = creatorMembershipRef(businessId, creatorId);
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
  const ref = creatorMembershipRef(data.businessId, uid);
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
 * `businesses/{businessId}/creatorMemberships/{uid}` reads/writes (TDD
 * §4/§8). This is the reference Repository every later repository is
 * reviewed against: persistence only, no business rules, no decision
 * about *whether* a write should happen — that belongs to a Service.
 *
 * Nested under the owning business (formerly a flat top-level
 * `creatorProfiles/{uid}` collection) so the same Firebase Auth uid
 * can hold an independent membership — and independent balance — in
 * more than one business at once. Every reader/writer of this
 * collection goes through `creatorMembershipsCollection`/
 * `creatorMembershipRef` below rather than re-deriving the path, so
 * there is exactly one place that knows the collection is nested.
 */
export function creatorMembershipsCollection(
  businessId: string,
): FirebaseFirestore.CollectionReference {
  return adminFirestore
    .collection('businesses')
    .doc(businessId)
    .collection('creatorMemberships');
}

export function creatorMembershipRef(
  businessId: string,
  uid: string,
): FirebaseFirestore.DocumentReference {
  return creatorMembershipsCollection(businessId).doc(uid);
}

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
  async findById(businessId: string, uid: string): Promise<CreatorProfile | null> {
    const snapshot = await creatorMembershipRef(businessId, uid).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as CreatorProfile;
  }

  async create(uid: string, data: CreatorProfileInput): Promise<void> {
    const now = FieldValue.serverTimestamp();
    await creatorMembershipRef(data.businessId, uid).set({
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
      updatedBy: uid,
      deletedAt: null,
    });
  }

  async update(businessId: string, uid: string, partial: CreatorProfileUpdate): Promise<void> {
    await creatorMembershipRef(businessId, uid).update({
      ...partial,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /** § app/r/[code]/route.ts — the creator-level aggregate, alongside the per-link `referralLinkRepository.incrementClickCount()`. */
  async incrementClickCount(businessId: string, uid: string): Promise<void> {
    await creatorMembershipRef(businessId, uid).update({ totalClicks: FieldValue.increment(1) });
  }

  /** § Creator Portal auth — uniqueness check while generating a new creator's referral code; see lib/creators/referralCode.ts. */
  async existsByReferralCode(
    businessId: string,
    referralCode: string,
  ): Promise<boolean> {
    const snapshot = await creatorMembershipsCollection(businessId)
      .where('referralCode', '==', referralCode)
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  /**
   * Admin: Creators (§ Admin: Creators) — real cursor pagination,
   * newest-first, optionally narrowed to one status and/or one
   * follower-range bucket (§ Creator Marketplace, admin creator
   * search). Every filtered shape (status + createdAt, followersRange
   * + createdAt, status + followersRange + createdAt) needs its own
   * composite index — see firestore.indexes.json. The unfiltered shape
   * (bare `createdAt` orderBy) is Firestore's automatic single-field
   * index now that `businessId` is the collection's path rather than a
   * filter.
   */
  async listByBusiness(
    businessId: string,
    options: { status?: CreatorStatus; followersRange?: string; limit?: number; cursor?: string } = {},
  ): Promise<{
    creators: { id: string; data: CreatorProfile }[];
    nextCursor: string | null;
  }> {
    const pageSize = options.limit ?? 25;
    let query = creatorMembershipsCollection(businessId) as FirebaseFirestore.Query;

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    if (options.followersRange) {
      query = query.where('followersRange', '==', options.followersRange);
    }
    query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);

    if (options.cursor) {
      const cursorDoc = await creatorMembershipRef(businessId, options.cursor).get();
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
    const snapshot = await creatorMembershipsCollection(businessId)
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
   *
   * Needs its own `status ASC, lifetimeEarningsKes ASC` composite
   * index (firestore.indexes.json) — a distinct index from
   * `listTopByBusiness`'s `lifetimeEarningsKes DESC` one, since this
   * query has no `orderBy` and Firestore requires ASCENDING for a bare
   * inequality filter. The two do not satisfy each other; this page
   * previously 500'd in production because only the DESC index had
   * ever been deployed.
   */
  async countActiveAboveEarnings(
    businessId: string,
    lifetimeEarningsKes: number,
  ): Promise<number> {
    const snapshot = await creatorMembershipsCollection(businessId)
      .where('status', '==', 'active')
      .where('lifetimeEarningsKes', '>', lifetimeEarningsKes)
      .count()
      .get();
    return snapshot.data().count;
  }

  /** § Creator Portal leaderboards — the "#N of M" denominator. */
  async countActive(businessId: string): Promise<number> {
    const snapshot = await creatorMembershipsCollection(businessId)
      .where('status', '==', 'active')
      .count()
      .get();
    return snapshot.data().count;
  }

  /**
   * § Admin: Marketing Emails segments — creators grouped by how many
   * referral conversions they've ever driven (`totalConversions`,
   * credited the instant a valid code is used — see
   * `ReferralService.awardCommission`'s own doc comment for why that
   * counts a `pending` creator's code too, not only `active` ones).
   * `gte` is a real range filter, so it orders by `totalConversions`
   * itself rather than `createdAt` — Firestore requires the first
   * `orderBy` to match the inequality field. The bare `eq`/`gte`
   * filter plus matching `orderBy` on `totalConversions` is Firestore's
   * automatic single-field index now that `businessId` is the path.
   */
  async listByConversionCount(
    businessId: string,
    filter: { eq: number } | { gte: number },
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ creators: { id: string; data: CreatorProfile }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 100;
    let query = creatorMembershipsCollection(businessId) as FirebaseFirestore.Query;

    query = 'eq' in filter ? query.where('totalConversions', '==', filter.eq) : query.where('totalConversions', '>=', filter.gte);
    query = query.orderBy('totalConversions', 'asc').limit(pageSize + 1);

    if (options.cursor) {
      const cursorDoc = await creatorMembershipRef(businessId, options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      creators: docs.map((doc) => ({ id: doc.id, data: doc.data() as CreatorProfile })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  /**
   * § Admin: Marketing Emails segments — creators who registered on or
   * after `since`. Reuses the same bare `createdAt DESC` automatic
   * single-field index `listByBusiness`'s unfiltered shape already
   * needs — a range filter on the same field the query already orders
   * by, not a new shape.
   */
  async listRegisteredSince(
    businessId: string,
    since: Date,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ creators: { id: string; data: CreatorProfile }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 100;
    let query = creatorMembershipsCollection(businessId)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await creatorMembershipRef(businessId, options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      creators: docs.map((doc) => ({ id: doc.id, data: doc.data() as CreatorProfile })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const creatorRepository = new CreatorRepository();

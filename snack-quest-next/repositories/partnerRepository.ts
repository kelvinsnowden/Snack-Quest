import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Partner, PartnerEarningsLedgerEntry } from '@/types';

const COLLECTION = 'partners';
const EARNINGS_LEDGER_SUBCOLLECTION = 'earningsLedger';

export class PartnerNotFoundError extends Error {
  constructor(partnerId: string) {
    super(`Partner ${partnerId} not found`);
    this.name = 'PartnerNotFoundError';
  }
}

export class InsufficientPartnerBalanceError extends Error {
  constructor(partnerId: string, requested: number, available: number) {
    super(`Partner ${partnerId} has only ${available} available, cannot reserve ${requested}`);
    this.name = 'InsufficientPartnerBalanceError';
  }
}

function partnerRef(partnerId: string) {
  return adminFirestore.collection(COLLECTION).doc(partnerId);
}

/**
 * Reserves `amountKes` of a partner's `availableCashKes` inside the
 * caller's transaction — the exact mirror of
 * `creatorRepository.reserveBalanceInTransaction`, used by
 * `WithdrawalService.requestWithdrawal()` so a partner can never
 * request more than they actually have, and two concurrent requests
 * can never together exceed it (§ OWNER WITHDRAWAL,
 * docs/MACHINE_COMMERCE.md §7).
 */
export async function reserveBalanceInTransaction(
  tx: Transaction,
  businessId: string,
  partnerId: string,
  amountKes: number,
): Promise<void> {
  const ref = partnerRef(partnerId);
  const snapshot = await tx.get(ref);
  const data = snapshot.data() as Partner | undefined;
  if (!data || data.businessId !== businessId) {
    throw new PartnerNotFoundError(partnerId);
  }
  if (data.availableCashKes < amountKes) {
    throw new InsufficientPartnerBalanceError(partnerId, amountKes, data.availableCashKes);
  }
  tx.update(ref, { availableCashKes: FieldValue.increment(-amountKes) });
}

/** The reverse of `reserveBalanceInTransaction` — a rejected or failed withdrawal releases the hold back to the partner. */
export function refundBalanceInTransaction(tx: Transaction, businessId: string, partnerId: string, amountKes: number): void {
  tx.update(partnerRef(partnerId), { availableCashKes: FieldValue.increment(amountKes) });
}

/**
 * Credits a settlement's distributable amount and writes the
 * append-only ledger entry backing it, both inside the caller's
 * transaction — the one and only credit path
 * (`MachineSettlementService.finalize()`), so a settlement's own
 * `draft → finalized` status guard (checked in the same transaction)
 * is what makes crediting idempotent, never this function's own
 * concern.
 */
export function creditEarningsInTransaction(
  tx: Transaction,
  partnerId: string,
  amountKes: number,
  entry: Omit<PartnerEarningsLedgerEntry, 'createdAt'>,
): void {
  tx.update(partnerRef(partnerId), {
    availableCashKes: FieldValue.increment(amountKes),
    lifetimeEarnedKes: FieldValue.increment(amountKes),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const ledgerRef = partnerRef(partnerId).collection(EARNINGS_LEDGER_SUBCOLLECTION).doc();
  tx.set(ledgerRef, { ...entry, createdAt: FieldValue.serverTimestamp() });
}

export async function listEarningsLedger(partnerId: string): Promise<PartnerEarningsLedgerEntry[]> {
  const snapshot = await partnerRef(partnerId).collection(EARNINGS_LEDGER_SUBCOLLECTION).orderBy('createdAt', 'desc').get();
  return snapshot.docs.map((doc) => doc.data() as PartnerEarningsLedgerEntry);
}

export type PartnerInput = Omit<Partner, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'> & {
  createdBy: string;
};

/** `partners` reads/writes (§ CORE ENTITIES 8, § multi-machine partner architecture). */
class PartnerRepository {
  async create(input: PartnerInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, partnerId: string): Promise<Partner | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(partnerId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Partner;
    return data.businessId === businessId ? data : null;
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: Partner }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Partner }));
  }

  /** § partner authentication — the login-side lookup, by the Firebase Auth uid a prior `register()` already linked. At most one partner can hold a given uid (`register` only ever links an unclaimed one), so `limit(1)` is safe. */
  async findByAuthUid(businessId: string, authUid: string): Promise<{ id: string; data: Partner } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('authUid', '==', authUid)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as Partner };
  }

  /**
   * § partner authentication — the register-side lookup: find the
   * staff-created partner record this email belongs to, so a
   * Firebase Auth account can claim it. Case-insensitive because
   * email casing is not a business decision anyone should have to get
   * exactly right twice (once when staff typed it, once when the
   * partner signs up). Excludes an already-claimed partner — a second
   * account can never claim the same partner out from under the
   * first.
   */
  async findUnclaimedByContactEmail(businessId: string, contactEmail: string): Promise<{ id: string; data: Partner } | null> {
    const normalized = contactEmail.trim().toLowerCase();
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    const match = snapshot.docs.find(
      (doc) => (doc.data() as Partner).contactEmail?.trim().toLowerCase() === normalized && (doc.data() as Partner).authUid === null,
    );
    return match ? { id: match.id, data: match.data() as Partner } : null;
  }

  /** § partner authentication — the one and only writer of `authUid`, called exactly once per partner, the moment `register()` links it. */
  async linkAuthUid(partnerId: string, authUid: string): Promise<void> {
    await partnerRef(partnerId).update({ authUid, updatedAt: FieldValue.serverTimestamp() });
  }
}

export const partnerRepository = new PartnerRepository();

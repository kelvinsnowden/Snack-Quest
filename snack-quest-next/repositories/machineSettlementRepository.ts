import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineSettlement, MachineSettlementStatus } from '@/types';

const COLLECTION = 'machineSettlements';

export class MachineSettlementNotFoundError extends Error {
  constructor(settlementId: string) {
    super(`Machine settlement ${settlementId} not found`);
    this.name = 'MachineSettlementNotFoundError';
  }
}

export class IllegalSettlementTransitionError extends Error {
  constructor(from: MachineSettlementStatus, to: MachineSettlementStatus) {
    super(`Cannot move a machine settlement from "${from}" to "${to}"`);
    this.name = 'IllegalSettlementTransitionError';
  }
}

export class OverlappingSettlementPeriodError extends Error {
  constructor(machineId: string, existingSettlementId: string) {
    super(`Machine ${machineId} already has a settlement (${existingSettlementId}) covering an overlapping period`);
    this.name = 'OverlappingSettlementPeriodError';
  }
}

export type MachineSettlementInput = Omit<MachineSettlement, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy' | 'finalizedAt' | 'paidAt'> & {
  createdBy: string;
};

/** `machineSettlements` reads/writes (§ CORE ENTITIES 9). No invented arithmetic here either — see the type's own doc comment. */
class MachineSettlementRepository {
  /**
   * The overlap-checked write (§ SETTLEMENT: "must be reproducible
   * and auditable" — silently double-drafting the same revenue is
   * neither). The overlap query and the write happen inside one
   * Firestore transaction, so two concurrent `createDraft` calls for
   * the same machine and period can never both pass the check before
   * either commits — the second one always re-reads the first one's
   * just-written document and throws. Existing settlements are read
   * by machine + businessId (not by period) because Firestore cannot
   * express "any doc whose stored range overlaps this new range" as a
   * query; the overlap test itself runs client-side afterward, over
   * what is always a small, bounded set (one machine's own lifetime
   * settlement count, never transaction-volume-sized).
   */
  async createIfNoOverlap(input: MachineSettlementInput): Promise<string> {
    return adminFirestore.runTransaction(async (tx) => {
      const query = adminFirestore.collection(COLLECTION).where('businessId', '==', input.businessId).where('machineId', '==', input.machineId);
      const snapshot = await tx.get(query);
      const newStartMs = input.periodStart.toMillis();
      const newEndMs = input.periodEnd.toMillis();
      const overlapping = snapshot.docs.find((doc) => {
        const existing = doc.data() as MachineSettlement;
        return existing.periodStart.toMillis() < newEndMs && existing.periodEnd.toMillis() > newStartMs;
      });
      if (overlapping) {
        throw new OverlappingSettlementPeriodError(input.machineId, overlapping.id);
      }

      const ref = adminFirestore.collection(COLLECTION).doc();
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...input,
        finalizedAt: null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
        updatedBy: input.createdBy,
        deletedAt: null,
      });
      return ref.id;
    });
  }

  async findById(businessId: string, settlementId: string): Promise<MachineSettlement | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(settlementId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineSettlement;
    return data.businessId === businessId ? data : null;
  }

  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: MachineSettlement }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('partnerId', '==', partnerId)
      .orderBy('periodStart', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineSettlement }));
  }

  async listByMachine(businessId: string, machineId: string): Promise<{ id: string; data: MachineSettlement }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('periodStart', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineSettlement }));
  }

  async getInTransaction(tx: Transaction, businessId: string, settlementId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: MachineSettlement } | null> {
    const ref = adminFirestore.collection(COLLECTION).doc(settlementId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineSettlement;
    return data.businessId === businessId ? { ref, data } : null;
  }

  /**
   * The one write that moves a settlement to `finalized` — always
   * called from inside the same transaction that credits the
   * partner's wallet (`MachineSettlementService.finalize()`), never on
   * its own, so the two can never disagree about whether a settlement
   * was actually paid out.
   */
  finalizeInTransaction(tx: Transaction, ref: FirebaseFirestore.DocumentReference, actor: string): void {
    tx.update(ref, {
      status: 'finalized' satisfies MachineSettlementStatus,
      finalizedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }
}

export const machineSettlementRepository = new MachineSettlementRepository();

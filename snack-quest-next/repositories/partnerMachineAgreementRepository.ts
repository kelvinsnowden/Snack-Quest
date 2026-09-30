import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CommercialTerms, PartnerMachineAgreement } from '@/types';

const COLLECTION = 'partnerMachineAgreements';

export class AgreementNotFoundError extends Error {
  constructor(agreementId: string) {
    super(`Agreement ${agreementId} not found`);
    this.name = 'AgreementNotFoundError';
  }
}

/** A status change or creation that would break "at most one active agreement per machine", or an illegal transition. */
export class AgreementConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgreementConflictError';
  }
}

export type PartnerMachineAgreementInput = Omit<PartnerMachineAgreement, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'> & {
  createdBy: string;
};

/** `partnerMachineAgreements` reads/writes (§ CORE ENTITIES 8). No commercial-term arithmetic here — see the type's own doc comment for why every term is nullable. */
class PartnerMachineAgreementRepository {
  async create(input: PartnerMachineAgreementInput): Promise<string> {
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

  /**
   * Creates an agreement, and when it starts `active`, checks inside the
   * same transaction that the machine has no other active agreement —
   * two concurrent creates can never leave a machine with two sets of
   * live terms.
   */
  async createChecked(input: PartnerMachineAgreementInput): Promise<string> {
    const ref = adminFirestore.collection(COLLECTION).doc();
    await adminFirestore.runTransaction(async (tx) => {
      if (input.status === 'active') {
        await this.assertNoOtherActiveInTransaction(tx, input.businessId, input.machineId, null);
      }
      const now = FieldValue.serverTimestamp();
      tx.set(ref, { ...input, createdAt: now, updatedAt: now, updatedBy: input.createdBy, deletedAt: null });
    });
    return ref.id;
  }

  private async assertNoOtherActiveInTransaction(tx: FirebaseFirestore.Transaction, businessId: string, machineId: string, exceptId: string | null): Promise<void> {
    const snapshot = await tx.get(
      adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('machineId', '==', machineId).where('status', '==', 'active'),
    );
    if (snapshot.docs.some((doc) => doc.id !== exceptId)) {
      throw new AgreementConflictError('This machine already has an active agreement. End it before starting another.');
    }
  }

  /**
   * `draft → active` or `draft|active → terminated`, re-reading the
   * agreement inside the transaction so two people acting at once
   * can't both succeed. Terminating stamps `effectiveTo` (now, unless
   * one was already set); activating stamps `effectiveFrom` if unset.
   */
  async transition(businessId: string, agreementId: string, to: 'active' | 'terminated', actor: string): Promise<PartnerMachineAgreement> {
    const ref = adminFirestore.collection(COLLECTION).doc(agreementId);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data() as PartnerMachineAgreement | undefined;
      if (!data || data.businessId !== businessId || data.deletedAt) {
        throw new AgreementNotFoundError(agreementId);
      }
      const allowed = to === 'active' ? data.status === 'draft' : data.status === 'draft' || data.status === 'active';
      if (!allowed) {
        throw new AgreementConflictError(`An agreement that is ${data.status} can’t become ${to}.`);
      }
      const changes: Record<string, unknown> = { status: to, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor };
      if (to === 'active') {
        await this.assertNoOtherActiveInTransaction(tx, businessId, data.machineId, agreementId);
        if (!data.effectiveFrom) changes.effectiveFrom = Timestamp.now();
      } else if (!data.effectiveTo) {
        changes.effectiveTo = Timestamp.now();
      }
      tx.update(ref, changes);
      return { ...data, ...changes } as PartnerMachineAgreement;
    });
  }

  async updateTerms(businessId: string, agreementId: string, terms: Partial<CommercialTerms>, actor: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(agreementId);
    await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data() as PartnerMachineAgreement | undefined;
      if (!data || data.businessId !== businessId) throw new AgreementNotFoundError(agreementId);
      tx.update(ref, { terms, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
    });
  }

  async listByMachine(businessId: string, machineId: string): Promise<{ id: string; data: PartnerMachineAgreement }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('machineId', '==', machineId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as PartnerMachineAgreement }));
  }

  async findById(businessId: string, agreementId: string): Promise<PartnerMachineAgreement | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(agreementId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as PartnerMachineAgreement;
    return data.businessId === businessId ? data : null;
  }

  /** The active agreement for a machine, if any — what `machineSettlementService` reads terms from. A machine may have at most one active agreement at a time; callers do not need to reconcile more than one. */
  async findActiveForMachine(businessId: string, machineId: string): Promise<{ id: string; data: PartnerMachineAgreement } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as PartnerMachineAgreement };
  }

  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: PartnerMachineAgreement }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('partnerId', '==', partnerId)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as PartnerMachineAgreement }));
  }
}

export const partnerMachineAgreementRepository = new PartnerMachineAgreementRepository();

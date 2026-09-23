import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { PartnerMachineAgreement } from '@/types';

const COLLECTION = 'partnerMachineAgreements';

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

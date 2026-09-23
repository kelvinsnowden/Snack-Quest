import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineSettlement } from '@/types';

const COLLECTION = 'machineSettlements';

export type MachineSettlementInput = Omit<MachineSettlement, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy' | 'finalizedAt' | 'paidAt'> & {
  createdBy: string;
};

/** `machineSettlements` reads/writes (§ CORE ENTITIES 9). No invented arithmetic here either — see the type's own doc comment. */
class MachineSettlementRepository {
  async create(input: MachineSettlementInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      finalizedAt: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
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
}

export const machineSettlementRepository = new MachineSettlementRepository();

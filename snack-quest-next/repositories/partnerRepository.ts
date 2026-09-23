import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Partner } from '@/types';

const COLLECTION = 'partners';

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
}

export const partnerRepository = new PartnerRepository();

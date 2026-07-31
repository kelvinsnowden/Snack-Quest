import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Business } from '@/types';

const COLLECTION = 'businesses';

export type BusinessInput = Omit<Business, keyof AuditFields>;

class BusinessRepository {
  async findById(businessId: string): Promise<Business | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(businessId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as Business;
  }

  /**
   * The only lookup a shared Whatchimp webhook endpoint has to resolve
   * which tenant an inbound message belongs to — every tenant's
   * traffic lands on the same URL, disambiguated only by which
   * WhatsApp number (phone_number_id) received it.
   */
  async findByWhatsappPhoneNumberId(
    phoneNumberId: string,
  ): Promise<{ id: string; data: Business } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('whatsappPhoneNumberId', '==', phoneNumberId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Business };
  }

  async create(id: string, data: BusinessInput, actor: string): Promise<void> {
    const now = FieldValue.serverTimestamp();
    await adminFirestore
      .collection(COLLECTION)
      .doc(id)
      .set({
        ...data,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      });
  }
}

export const businessRepository = new BusinessRepository();

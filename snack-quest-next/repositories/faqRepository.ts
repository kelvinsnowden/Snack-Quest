import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Faq } from '@/types';

/**
 * `faqs` reads/writes (§ Admin: FAQ). Same shape as `packageRepository`,
 * with a `staffRepository`-style soft delete since the Admin FAQ list
 * needs a real delete, not just a deactivate toggle.
 */

const COLLECTION = 'faqs';

export type FaqInput = Omit<Faq, keyof AuditFields>;

class FaqRepository {
  /** The homepage FAQ section and `/faq` page's read — oldest first, matching creation order. */
  async listActive(businessId: string): Promise<{ id: string; data: Faq }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Faq }))
      .filter((entry) => !entry.data.deletedAt);
  }

  /** Admin: FAQ (§ Admin: FAQ) — every entry regardless of `isActive`, for the management list. */
  async listAllByBusiness(businessId: string): Promise<{ id: string; data: Faq }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Faq }))
      .filter((entry) => !entry.data.deletedAt);
  }

  async findById(businessId: string, faqId: string): Promise<Faq | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(faqId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Faq;
    return data.businessId === businessId && !data.deletedAt ? data : null;
  }

  async create(data: FaqInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }

  async update(faqId: string, patch: Partial<FaqInput>, actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(faqId)
      .update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  /** § Admin: FAQ — soft delete, matching `findById`/`listActive`/`listAllByBusiness`'s existing `deletedAt` filter. */
  async softDelete(faqId: string, actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(faqId)
      .update({ deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }
}

export const faqRepository = new FaqRepository();

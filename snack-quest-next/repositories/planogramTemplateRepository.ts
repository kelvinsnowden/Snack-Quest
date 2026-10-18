import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { PlanogramTemplate } from '@/types';

const COLLECTION = 'planogramTemplates';

class PlanogramTemplateRepository {
  async create(input: Omit<PlanogramTemplate, 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = adminFirestore.collection(COLLECTION).doc();
    await ref.set({ ...input, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return ref.id;
  }

  async findById(businessId: string, templateId: string): Promise<PlanogramTemplate | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(templateId).get();
    const data = snapshot.data() as PlanogramTemplate | undefined;
    return data && data.businessId === businessId ? data : null;
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: PlanogramTemplate }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as PlanogramTemplate })).sort((a, b) => a.data.name.localeCompare(b.data.name));
  }

  async delete(businessId: string, templateId: string): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(templateId);
    const data = (await ref.get()).data() as PlanogramTemplate | undefined;
    if (!data || data.businessId !== businessId) return false;
    await ref.delete();
    return true;
  }
}

export const planogramTemplateRepository = new PlanogramTemplateRepository();

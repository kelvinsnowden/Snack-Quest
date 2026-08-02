import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Campaign } from '@/types';

/** `campaigns` reads/writes (§ Creator Portal campaigns browse). `create` has no caller yet (no admin campaign-management UI exists), but is real, tested persistence — used directly by test fixtures today, and ready for that admin UI when it's built. */

const COLLECTION = 'campaigns';

export type CampaignInput = Omit<Campaign, keyof AuditFields>;

class CampaignRepository {
  async create(input: CampaignInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, campaignId: string): Promise<Campaign | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(campaignId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Campaign;
    return data.businessId === businessId ? data : null;
  }

  /** § Creator Portal campaigns browse — every currently-joinable campaign, soonest deadline first. */
  async listActive(businessId: string): Promise<{ id: string; data: Campaign }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'active')
      .orderBy('deadline', 'asc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Campaign }));
  }
}

export const campaignRepository = new CampaignRepository();

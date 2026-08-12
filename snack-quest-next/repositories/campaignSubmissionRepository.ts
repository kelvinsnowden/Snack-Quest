import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, CampaignSubmission } from '@/types';

/** `campaignSubmissions` reads/writes (§ Creator Portal campaigns browse). */

const COLLECTION = 'campaignSubmissions';

export type CampaignSubmissionInput = Omit<CampaignSubmission, keyof AuditFields>;

class CampaignSubmissionRepository {
  async create(input: CampaignSubmissionInput, actor: string): Promise<string> {
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

  /** § Creator Portal campaigns browse — a creator's own submission history, newest first. */
  async listByCreator(
    businessId: string,
    creatorId: string,
  ): Promise<{ id: string; data: CampaignSubmission }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('creatorId', '==', creatorId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as CampaignSubmission }));
  }

  /** § Admin: Campaigns submissions — every creator's proof for one campaign, newest first. */
  async listByCampaign(
    businessId: string,
    campaignId: string,
  ): Promise<{ id: string; data: CampaignSubmission }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('campaignId', '==', campaignId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as CampaignSubmission }));
  }
}

export const campaignSubmissionRepository = new CampaignSubmissionRepository();

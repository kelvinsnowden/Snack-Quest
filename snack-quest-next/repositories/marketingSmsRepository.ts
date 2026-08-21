import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, MarketingSmsCampaign } from '@/types';

/**
 * `marketingSmsCampaigns` reads/writes (§ Admin: Marketing SMS) —
 * persistence only, same discipline as `marketingEmailRepository`: no
 * decision about segment resolution, opt-out filtering or sending, all
 * of which is `services/marketingSmsService.ts`.
 */

const COLLECTION = 'marketingSmsCampaigns';

export type MarketingSmsCampaignInput = Omit<MarketingSmsCampaign, keyof AuditFields>;
export type MarketingSmsCampaignUpdate = Partial<MarketingSmsCampaignInput> & { updatedBy: string };

class MarketingSmsRepository {
  async findById(campaignId: string): Promise<MarketingSmsCampaign | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(campaignId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as MarketingSmsCampaign;
  }

  async create(data: MarketingSmsCampaignInput, actor: string): Promise<string> {
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

  async update(campaignId: string, partial: MarketingSmsCampaignUpdate): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(campaignId)
      .update({ ...partial, updatedAt: FieldValue.serverTimestamp() });
  }

  async delete(campaignId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(campaignId).delete();
  }

  /** Admin: Marketing SMS history — real cursor pagination, newest first. Needs the `businessId ASC, createdAt DESC` composite index in firestore.indexes.json. */
  async listByBusiness(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ campaigns: { id: string; data: MarketingSmsCampaign }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      campaigns: docs.map((doc) => ({ id: doc.id, data: doc.data() as MarketingSmsCampaign })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const marketingSmsRepository = new MarketingSmsRepository();
export { MarketingSmsRepository };

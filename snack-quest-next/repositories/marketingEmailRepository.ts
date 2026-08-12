import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, MarketingEmailCampaign } from '@/types';

/**
 * `marketingEmailCampaigns` reads/writes (§ Admin: Marketing Emails) —
 * persistence only, same discipline as every other Repository: no
 * decision about segment resolution or sending, that's
 * `services/marketingEmailService.ts`.
 */

const COLLECTION = 'marketingEmailCampaigns';

export type MarketingEmailCampaignInput = Omit<MarketingEmailCampaign, keyof AuditFields>;
export type MarketingEmailCampaignUpdate = Partial<MarketingEmailCampaignInput> & { updatedBy: string };

class MarketingEmailRepository {
  async findById(campaignId: string): Promise<MarketingEmailCampaign | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(campaignId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as MarketingEmailCampaign;
  }

  async create(data: MarketingEmailCampaignInput, actor: string): Promise<string> {
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

  async update(campaignId: string, partial: MarketingEmailCampaignUpdate): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(campaignId)
      .update({ ...partial, updatedAt: FieldValue.serverTimestamp() });
  }

  async delete(campaignId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(campaignId).delete();
  }

  /** Admin: Marketing Emails history — real cursor pagination, newest first. Needs the `businessId ASC, createdAt DESC` composite index in firestore.indexes.json (an equality filter plus an orderBy on a different field always needs one). */
  async listByBusiness(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ campaigns: { id: string; data: MarketingEmailCampaign }[]; nextCursor: string | null }> {
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
      campaigns: docs.map((doc) => ({ id: doc.id, data: doc.data() as MarketingEmailCampaign })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const marketingEmailRepository = new MarketingEmailRepository();

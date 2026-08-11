import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MarketingSpendEntry } from '@/types';

const COLLECTION = 'marketingSpendEntries';

function docId(businessId: string, month: string): string {
  return `${businessId}_${month}`;
}

class MarketingSpendRepository {
  async findByMonth(businessId: string, month: string): Promise<MarketingSpendEntry | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(docId(businessId, month)).get();
    return snapshot.exists ? (snapshot.data() as MarketingSpendEntry) : null;
  }

  async listByMonths(businessId: string, months: string[]): Promise<Map<string, MarketingSpendEntry>> {
    const entries = await Promise.all(months.map((month) => this.findByMonth(businessId, month)));
    const byMonth = new Map<string, MarketingSpendEntry>();
    entries.forEach((entry, index) => {
      if (entry) byMonth.set(months[index], entry);
    });
    return byMonth;
  }

  async set(
    businessId: string,
    month: string,
    amountKes: number,
    actor: string,
    channelSpend: { metaSpendKes?: number; tiktokSpendKes?: number } = {},
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(docId(businessId, month))
      .set(
        {
          businessId,
          month,
          amountKes,
          // Omitted entirely (not `undefined`) when unset — Firestore rejects an explicit `undefined` field value.
          ...(typeof channelSpend.metaSpendKes === 'number' ? { metaSpendKes: channelSpend.metaSpendKes } : {}),
          ...(typeof channelSpend.tiktokSpendKes === 'number' ? { tiktokSpendKes: channelSpend.tiktokSpendKes } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor,
        },
        // Merge, not replace — a save that only touches the blended
        // total (or only the channel split) must never silently wipe
        // whichever half of the form it didn't carry.
        { merge: true },
      );
  }
}

export const marketingSpendRepository = new MarketingSpendRepository();

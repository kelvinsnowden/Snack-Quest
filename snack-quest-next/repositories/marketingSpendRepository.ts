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

  async set(businessId: string, month: string, amountKes: number, actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(docId(businessId, month))
      .set({
        businessId,
        month,
        amountKes,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }
}

export const marketingSpendRepository = new MarketingSpendRepository();

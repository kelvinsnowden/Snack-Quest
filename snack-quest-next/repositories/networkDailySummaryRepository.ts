import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { networkDailySummaryDocId, type NetworkDailySummary } from '@/types';

const COLLECTION = 'networkDailySummary';

/** `networkDailySummary` reads/writes (§ NETWORK INTELLIGENCE). Persistence only, same replace-whole-document shape as `machineDailySummaryRepository`/`partnerDailySummaryRepository`. */
class NetworkDailySummaryRepository {
  async put(businessId: string, date: string, rollup: Omit<NetworkDailySummary, 'businessId' | 'date' | 'rebuiltAt'>): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(networkDailySummaryDocId(businessId, date));
    await ref.set({
      ...rollup,
      businessId,
      date,
      rebuiltAt: Timestamp.now(),
    } as unknown as NetworkDailySummary);
  }

  async get(businessId: string, date: string): Promise<NetworkDailySummary | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(networkDailySummaryDocId(businessId, date)).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as NetworkDailySummary;
    return data.businessId === businessId ? data : null;
  }

  async listRange(businessId: string, startDate: string, endDate: string): Promise<Map<string, NetworkDailySummary>> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    const byDate = new Map<string, NetworkDailySummary>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as NetworkDailySummary;
      byDate.set(data.date, data);
    }
    return byDate;
  }
}

export const networkDailySummaryRepository = new NetworkDailySummaryRepository();

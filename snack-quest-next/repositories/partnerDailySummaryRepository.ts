import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { partnerDailySummaryDocId, type PartnerDailySummary } from '@/types';

const COLLECTION = 'partnerDailySummary';

/** `partnerDailySummary` reads/writes (§ ANALYTICS, § RBAC "27 machines, one read"). Persistence only, same replace-whole-document shape as `machineDailySummaryRepository`. */
class PartnerDailySummaryRepository {
  async put(
    businessId: string,
    partnerId: string,
    date: string,
    rollup: Omit<PartnerDailySummary, 'businessId' | 'partnerId' | 'date' | 'rebuiltAt'>,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(partnerDailySummaryDocId(partnerId, date));
    await ref.set({
      ...rollup,
      businessId,
      partnerId,
      date,
      rebuiltAt: Timestamp.now(),
    } as unknown as PartnerDailySummary);
  }

  async get(businessId: string, partnerId: string, date: string): Promise<PartnerDailySummary | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(partnerDailySummaryDocId(partnerId, date)).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as PartnerDailySummary;
    return data.businessId === businessId ? data : null;
  }

  async listRange(businessId: string, partnerId: string, startDate: string, endDate: string): Promise<Map<string, PartnerDailySummary>> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('partnerId', '==', partnerId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    const byDate = new Map<string, PartnerDailySummary>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as PartnerDailySummary;
      byDate.set(data.date, data);
    }
    return byDate;
  }
}

export const partnerDailySummaryRepository = new PartnerDailySummaryRepository();

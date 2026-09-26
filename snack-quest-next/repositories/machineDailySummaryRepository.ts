import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineDailySummaryDocId, type MachineDailySummary } from '@/types';

const COLLECTION = 'machineDailySummary';

/**
 * `machineDailySummary` reads/writes (§ ANALYTICS). Persistence only,
 * same shape as `trafficDailyRepository` — `put` always replaces the
 * whole document for one machine+day, so a rebuild is idempotent by
 * construction rather than an incrementing counter that could drift if
 * run twice.
 */
class MachineDailySummaryRepository {
  async put(
    businessId: string,
    machineId: string,
    date: string,
    rollup: Omit<MachineDailySummary, 'businessId' | 'machineId' | 'date' | 'rebuiltAt'>,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(machineDailySummaryDocId(machineId, date));
    await ref.set({
      ...rollup,
      businessId,
      machineId,
      date,
      rebuiltAt: Timestamp.now(),
    } as unknown as MachineDailySummary);
  }

  async get(businessId: string, machineId: string, date: string): Promise<MachineDailySummary | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(machineDailySummaryDocId(machineId, date)).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineDailySummary;
    return data.businessId === businessId ? data : null;
  }

  /** The rollups covering `[startDate, endDate]` inclusive, by date key — the paginated-history read a machine's own dashboard uses. */
  async listRange(businessId: string, machineId: string, startDate: string, endDate: string): Promise<Map<string, MachineDailySummary>> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    const byDate = new Map<string, MachineDailySummary>();
    for (const doc of snapshot.docs) {
      const data = doc.data() as MachineDailySummary;
      byDate.set(data.date, data);
    }
    return byDate;
  }

  /** Every machine's rollup for one date — the input to `partnerDailySummary`'s own sum. */
  async listForDate(businessId: string, machineIds: string[], date: string): Promise<Map<string, MachineDailySummary>> {
    const byMachine = new Map<string, MachineDailySummary>();
    await Promise.all(
      machineIds.map(async (machineId) => {
        const rollup = await this.get(businessId, machineId, date);
        if (rollup) {
          byMachine.set(machineId, rollup);
        }
      }),
    );
    return byMachine;
  }
}

export const machineDailySummaryRepository = new MachineDailySummaryRepository();

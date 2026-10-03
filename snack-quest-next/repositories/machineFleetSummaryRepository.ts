import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineFleetSummary } from '@/types';

const COLLECTION = 'machineFleetSummary';

/** `machineFleetSummary` reads/writes. One document per machine, keyed by machine id; only `machineFleetSummaryService` writes. */
class MachineFleetSummaryRepository {
  async set(summary: Omit<MachineFleetSummary, 'refreshedAt'>): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(summary.machineId).set({ ...summary, refreshedAt: FieldValue.serverTimestamp() });
  }

  /** Summaries for the given machines, in one round trip. Missing or other-business ones are left out. */
  async getMany(businessId: string, machineIds: string[]): Promise<Map<string, MachineFleetSummary>> {
    const out = new Map<string, MachineFleetSummary>();
    if (machineIds.length === 0) return out;
    const snapshots = await adminFirestore.getAll(...machineIds.map((id) => adminFirestore.collection(COLLECTION).doc(id)));
    for (const snapshot of snapshots) {
      const data = snapshot.data() as MachineFleetSummary | undefined;
      if (data && data.businessId === businessId) out.set(snapshot.id, data);
    }
    return out;
  }
}

export const machineFleetSummaryRepository = new MachineFleetSummaryRepository();

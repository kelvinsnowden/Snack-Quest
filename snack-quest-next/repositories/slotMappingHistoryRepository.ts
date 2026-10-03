import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Timestamp } from 'firebase/firestore';

const COLLECTION = 'slotMappingHistory';

export interface SlotMappingChange {
  businessId: string;
  machineId: string;
  slotCode: string;
  from: string | null;
  to: string | null;
  changedBy: string;
  changedAt: Timestamp;
}

/**
 * `slotMappingHistory` — append-only: which manufacturer slot id each of
 * our slots answered to, and when that changed. Never updated or deleted,
 * so "which spiral did slot A01 mean last Tuesday?" always has an answer
 * (dispense commands also capture the manufacturer slot id at dispatch,
 * so a remap can never redirect one already sent).
 */
class SlotMappingHistoryRepository {
  async append(changes: Omit<SlotMappingChange, 'changedAt'>[]): Promise<void> {
    if (changes.length === 0) return;
    const batch = adminFirestore.batch();
    for (const change of changes) {
      batch.create(adminFirestore.collection(COLLECTION).doc(), { ...change, changedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }

  async listForMachine(businessId: string, machineId: string, limit = 100): Promise<SlotMappingChange[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('changedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as SlotMappingChange);
  }
}

export const slotMappingHistoryRepository = new SlotMappingHistoryRepository();

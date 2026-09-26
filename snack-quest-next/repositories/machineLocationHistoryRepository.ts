import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineLocationHistoryEntry } from '@/types';

const COLLECTION = 'machineLocationHistory';

export type MachineLocationHistoryInput = Omit<MachineLocationHistoryEntry, 'effectiveFrom' | 'effectiveTo'>;

/**
 * `machineLocationHistory` reads/writes (§ CORE ENTITIES 6).
 * `machineService.relocate()` always calls `closeCurrentInTransaction`
 * and `openInTransaction` together, in the same transaction as the
 * machine document's own location fields — so a machine can never end
 * up with two open history entries, or a location update on the
 * machine that has no matching history record.
 */
class MachineLocationHistoryRepository {
  /** Closes whatever entry is currently open for this machine (`effectiveTo: null`) — a no-op if there is none yet, which is the state a brand-new machine starts in. */
  async closeCurrentInTransaction(tx: Transaction, businessId: string, machineId: string): Promise<void> {
    const snapshot = await tx.get(
      adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', businessId)
        .where('machineId', '==', machineId)
        .where('effectiveTo', '==', null),
    );
    for (const doc of snapshot.docs) {
      tx.update(doc.ref, { effectiveTo: FieldValue.serverTimestamp() });
    }
  }

  openInTransaction(tx: Transaction, input: MachineLocationHistoryInput): void {
    const ref = adminFirestore.collection(COLLECTION).doc();
    tx.set(ref, { ...input, effectiveFrom: FieldValue.serverTimestamp(), effectiveTo: null });
  }

  /** Every location this machine has held, oldest first. */
  async listByMachine(businessId: string, machineId: string): Promise<MachineLocationHistoryEntry[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('effectiveFrom', 'asc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineLocationHistoryEntry);
  }
}

export const machineLocationHistoryRepository = new MachineLocationHistoryRepository();

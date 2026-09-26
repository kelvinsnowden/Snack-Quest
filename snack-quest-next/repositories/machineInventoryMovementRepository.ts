import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineInventoryMovement, MachineInventoryMovementReason } from '@/types';

const COLLECTION = 'machineInventoryMovements';

export type MachineInventoryMovementInput = Omit<MachineInventoryMovement, 'createdAt'>;

/**
 * `machineInventoryMovements` reads/writes (§ CORE ENTITIES 4). The
 * immutable ledger behind `MachineSlot.currentQuantity` — see that
 * type's own doc comment for why this collection, and not the cached
 * number, is what a reconciliation trusts.
 */
class MachineInventoryMovementRepository {
  /** Records a movement inside the caller's transaction — used by `machineInventoryMovementService` alongside the slot-quantity update it always accompanies, so the two never disagree. */
  createInTransaction(tx: Transaction, input: MachineInventoryMovementInput): void {
    const ref = adminFirestore.collection(COLLECTION).doc();
    tx.set(ref, { ...input, createdAt: FieldValue.serverTimestamp() });
  }

  async create(input: MachineInventoryMovementInput): Promise<string> {
    const ref = await adminFirestore.collection(COLLECTION).add({ ...input, createdAt: FieldValue.serverTimestamp() });
    return ref.id;
  }

  /** Newest first — the per-slot adjustment history, same shape as `inventoryMovementRepository.listByPackage`. */
  async listBySlot(businessId: string, machineId: string, slotId: string, limit = 50): Promise<{ id: string; data: MachineInventoryMovement }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('slotId', '==', slotId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineInventoryMovement }));
  }

  /**
   * Recomputes what a slot's `currentQuantity` *should* be by summing
   * every movement ever recorded for it — the reconciliation check
   * (§ TESTING: "stock reconciliation"). A mismatch against the
   * cached value on the slot means something wrote to
   * `currentQuantity` outside this ledger, which is the bug this
   * exists to catch.
   */
  async sumDeltasForSlot(businessId: string, machineId: string, slotId: string): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('slotId', '==', slotId)
      .get();
    return snapshot.docs.reduce((sum, doc) => sum + (doc.data() as MachineInventoryMovement).quantityDelta, 0);
  }

  /** Every movement of one reason in a window, cursor-paged — the rollup primitive for units-sold/restock-frequency metrics (§ ANALYTICS). */
  async *streamMovementsInRange(
    businessId: string,
    options: { reason: MachineInventoryMovementReason; since?: Date; until?: Date; machineId?: string; pageSize?: number },
  ): AsyncGenerator<{ id: string; data: MachineInventoryMovement }> {
    const pageSize = options.pageSize ?? 500;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', businessId)
        .where('reason', '==', options.reason) as FirebaseFirestore.Query;
      if (options.machineId) {
        query = query.where('machineId', '==', options.machineId);
      }
      if (options.since) {
        query = query.where('createdAt', '>=', options.since);
      }
      if (options.until) {
        query = query.where('createdAt', '<', options.until);
      }
      query = query.orderBy('createdAt', 'desc').limit(pageSize);
      if (cursor) {
        query = query.startAfter(cursor);
      }
      const snapshot = await query.get();
      if (snapshot.empty) {
        return;
      }
      for (const doc of snapshot.docs) {
        yield { id: doc.id, data: doc.data() as MachineInventoryMovement };
      }
      if (snapshot.size < pageSize) {
        return;
      }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
}

export const machineInventoryMovementRepository = new MachineInventoryMovementRepository();

import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { InventoryMovement } from '@/types';

const COLLECTION = 'inventoryMovements';

export type InventoryMovementInput = Omit<InventoryMovement, 'createdAt'>;

/** Records a movement inside the caller's transaction — used by `InventoryService.adjustStock()` alongside `adjustStockInTransaction()`, same one-transaction discipline as `referralAttributionRepository.createInTransaction`. */
export function createInTransaction(tx: Transaction, input: InventoryMovementInput): void {
  const ref = adminFirestore.collection(COLLECTION).doc();
  tx.set(ref, { ...input, createdAt: FieldValue.serverTimestamp() });
}

class InventoryMovementRepository {
  async create(input: InventoryMovementInput): Promise<string> {
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  /** Newest first — the Admin Inventory view's per-product adjustment history. */
  async listByPackage(
    businessId: string,
    packageId: string,
    limit = 25,
  ): Promise<{ id: string; data: InventoryMovement }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('packageId', '==', packageId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as InventoryMovement }));
  }
}

export const inventoryMovementRepository = new InventoryMovementRepository();

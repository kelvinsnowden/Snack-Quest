import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, InventoryBatch } from '@/types';

const COLLECTION = 'inventoryBatches';

export type InventoryBatchInput = Omit<InventoryBatch, keyof AuditFields>;

export class InventoryBatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`Inventory batch ${batchId} not found`);
    this.name = 'InventoryBatchNotFoundError';
  }
}

export class InsufficientBatchQuantityError extends Error {
  constructor(batchId: string, attempted: number, available: number) {
    super(
      `Cannot remove ${attempted} units from batch ${batchId} — only ${available} remaining`,
    );
    this.name = 'InsufficientBatchQuantityError';
  }
}

/**
 * Creates a batch inside `PurchaseOrderService.receivePurchaseOrder()`'s
 * transaction, alongside the `inventoryMovements` entry and
 * `packages.stockCount` increment it triggers — a doc ref is generated
 * up front (Admin SDK transactions allow this before any read/write)
 * so the caller can use its id for the movement's `batchId` in the
 * same transaction.
 */
export function createInTransaction(
  tx: Transaction,
  input: InventoryBatchInput,
  actor: string,
): string {
  const ref = adminFirestore.collection(COLLECTION).doc();
  const now = FieldValue.serverTimestamp();
  tx.set(ref, {
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    deletedAt: null,
  });
  return ref.id;
}

/**
 * `InventoryService.writeOffBatch()`'s write — validated here, same
 * discipline as `packageRepository.adjustStockInTransaction`: reads
 * the batch inside the transaction, rejects a write-off larger than
 * what remains, and flips `status` to the given terminal state only
 * when the write-off empties the batch (a partial write-off stays
 * `active`).
 */
export async function writeOffInTransaction(
  tx: Transaction,
  businessId: string,
  batchId: string,
  quantity: number,
  terminalStatus: 'expired' | 'written_off',
  actor: string,
): Promise<number> {
  const ref = adminFirestore.collection(COLLECTION).doc(batchId);
  const snapshot = await tx.get(ref);
  const data = snapshot.data() as InventoryBatch | undefined;
  if (!data || data.businessId !== businessId) {
    throw new InventoryBatchNotFoundError(batchId);
  }
  if (quantity > data.quantityRemaining) {
    throw new InsufficientBatchQuantityError(
      batchId,
      quantity,
      data.quantityRemaining,
    );
  }
  const remaining = data.quantityRemaining - quantity;
  tx.update(ref, {
    quantityRemaining: remaining,
    status: remaining === 0 ? terminalStatus : data.status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor,
  });
  return remaining;
}

class InventoryBatchRepository {
  async findById(
    businessId: string,
    batchId: string,
  ): Promise<InventoryBatch | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(batchId)
      .get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as InventoryBatch;
    return data.businessId === businessId ? data : null;
  }

  /** Newest first — a product's received-batch history. */
  async listByPackage(
    businessId: string,
    packageId: string,
    limit = 25,
  ): Promise<{ id: string; data: InventoryBatch }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('packageId', '==', packageId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as InventoryBatch,
    }));
  }

  /**
   * Active batches expiring within `withinDays` (§ Admin: Inventory —
   * expiring-soon), soonest first. A batch with no `expiresAt` never
   * appears here — there is nothing to alert on.
   */
  async listExpiringSoon(
    businessId: string,
    withinDays: number,
    limit = 50,
  ): Promise<{ id: string; data: InventoryBatch }[]> {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'active')
      .where('expiresAt', '<=', cutoff)
      .orderBy('expiresAt', 'asc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as InventoryBatch,
    }));
  }

  /**
   * Every active batch, oldest received first — the default "Batches"
   * view. Cursor-paginated the same way as `orderRepository.listByBusiness`
   * and `purchaseOrderRepository.listByBusiness`: once a business has
   * received more than a page's worth of purchase orders, older
   * batches used to fall off the end of a bare `.limit()` with no way
   * to reach them — `hasMore`/`nextCursor` here is what the page uses
   * to render a real "Load more" instead of silently truncating.
   */
  async listActive(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{
    batches: { id: string; data: InventoryBatch }[];
    nextCursor: string | null;
  }> {
    const pageSize = options.limit ?? 50;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'active')
      .orderBy('receivedAt', 'asc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await adminFirestore
        .collection(COLLECTION)
        .doc(options.cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      batches: docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as InventoryBatch,
      })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const inventoryBatchRepository = new InventoryBatchRepository();

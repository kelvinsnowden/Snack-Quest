import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { adjustStockInTransaction } from '@/repositories/packageRepository';
import { createInTransaction as createMovementInTransaction } from '@/repositories/inventoryMovementRepository';
import { inventoryBatchRepository, writeOffInTransaction, InventoryBatchNotFoundError } from '@/repositories/inventoryBatchRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { InventoryMovementReason, Package } from '@/types';

export { InventoryBatchNotFoundError, InsufficientBatchQuantityError } from '@/repositories/inventoryBatchRepository';

export class InvalidWriteOffQuantityError extends Error {
  constructor() {
    super('quantity must be a positive whole number');
    this.name = 'InvalidWriteOffQuantityError';
  }
}

/**
 * Owns manual stock adjustments (§ Admin: Inventory) — the one place
 * a staff member's "+10 restock" or "-2 damaged" turns into both the
 * `packages.stockCount` write and the `inventoryMovements` audit
 * record, atomically, so the two can never drift apart. Also owns
 * batch write-offs (§ Inventory: batches, purchase orders, suppliers,
 * movements, low-stock alerts, expiry, audit trail) — the counterpart
 * to `PurchaseOrderService.receivePurchaseOrder()` on the way stock
 * leaves through expiry or damage rather than a sale.
 */
class InventoryService {
  async adjustStock(
    businessId: string,
    packageId: string,
    delta: number,
    reason: InventoryMovementReason,
    actor: string,
    note?: string,
  ): Promise<number> {
    const resultingStockCount = await adminFirestore.runTransaction(async (tx) => {
      const next = await adjustStockInTransaction(tx, businessId, packageId, delta);
      createMovementInTransaction(tx, {
        businessId,
        packageId,
        delta,
        resultingStockCount: next,
        reason,
        batchId: null,
        note: note ?? null,
        actor,
      });
      return next;
    });

    await publishEvent(businessId, 'InventoryAdjusted', 'package', packageId, {
      delta,
      resultingStockCount,
      reason,
      actor,
    });

    return resultingStockCount;
  }

  /**
   * Writes off some (or all) of a batch's remaining quantity as
   * `expired` or damaged/other (`written_off`) — decrements the batch
   * and, when the package tracks stock, `packages.stockCount` too,
   * atomically. Clamped at 0 rather than throwing if `stockCount` is
   * already lower than the write-off quantity: batch quantities and
   * `stockCount` are two independently-adjustable numbers (a manual
   * `adjustStock` correction doesn't touch any batch), so they can
   * legitimately drift — that drift should never block a real expiry
   * write-off from being recorded.
   */
  async writeOffBatch(
    businessId: string,
    batchId: string,
    quantity: number,
    reason: Extract<InventoryMovementReason, 'expired' | 'written_off'>,
    actor: string,
    note?: string,
  ): Promise<{ remaining: number }> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidWriteOffQuantityError();
    }
    const batch = await inventoryBatchRepository.findById(businessId, batchId);
    if (!batch) {
      throw new InventoryBatchNotFoundError(batchId);
    }

    const remaining = await adminFirestore.runTransaction(async (tx) => {
      // Firestore transactions require every read before any write — the
      // package read must happen before `writeOffInTransaction`'s own
      // internal batch read+write, not after it.
      const packageRef = adminFirestore.collection('packages').doc(batch.packageId);
      const packageSnapshot = await tx.get(packageRef);
      const packageData = packageSnapshot.data() as Package | undefined;

      const remainingAfterWriteOff = await writeOffInTransaction(tx, businessId, batchId, quantity, reason, actor);

      let resultingStockCount: number | null = null;
      if (packageData && packageData.stockCount !== undefined) {
        resultingStockCount = Math.max(0, packageData.stockCount - quantity);
        tx.update(packageRef, { stockCount: resultingStockCount, updatedAt: FieldValue.serverTimestamp() });
      }

      createMovementInTransaction(tx, {
        businessId,
        packageId: batch.packageId,
        delta: -quantity,
        resultingStockCount,
        reason,
        batchId,
        note: note ?? null,
        actor,
      });

      return remainingAfterWriteOff;
    });

    await publishEvent(businessId, 'InventoryBatchWrittenOff', 'inventoryBatch', batchId, {
      quantity,
      reason,
      remaining,
      actor,
    });

    return { remaining };
  }
}

export const inventoryService = new InventoryService();
export { InventoryService };

import 'server-only';

import { adminFirestore } from '@/lib/firebase/admin';
import { adjustStockInTransaction } from '@/repositories/packageRepository';
import { createInTransaction as createMovementInTransaction } from '@/repositories/inventoryMovementRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { InventoryMovementReason } from '@/types';

/**
 * Owns manual stock adjustments (§ Admin: Inventory) — the one place
 * a staff member's "+10 restock" or "-2 damaged" turns into both the
 * `packages.stockCount` write and the `inventoryMovements` audit
 * record, atomically, so the two can never drift apart.
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
}

export const inventoryService = new InventoryService();
export { InventoryService };

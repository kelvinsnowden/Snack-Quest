import type { Timestamp } from 'firebase/firestore';

/**
 * `inventoryMovements/{movementId}` — the audit trail for manual
 * stock adjustments made through the Admin Inventory view (§ Admin:
 * Inventory). Deliberately scoped to manual adjustments only for now:
 * the automatic decrement `packageRepository.reserveStockInTransaction`
 * makes on every paid order does NOT yet write here — a full ledger
 * covering every source of stock change (orders, restocks, purchase
 * orders, damage/expiry write-offs) is the fuller Inventory domain
 * (§ Inventory: batches, purchase orders, suppliers, movements,
 * low-stock alerts, expiry, audit trail), not this one.
 */
export type InventoryMovementReason = 'restock' | 'correction' | 'damaged' | 'other';

export interface InventoryMovement {
  businessId: string;
  packageId: string;
  /** Positive = stock added, negative = stock removed. */
  delta: number;
  /** The package's `stockCount` immediately after this movement — lets the ledger be read without re-deriving a running total. */
  resultingStockCount: number;
  reason: InventoryMovementReason;
  note: string | null;
  actor: string;
  createdAt: Timestamp;
}

import type { Timestamp } from 'firebase/firestore';

/**
 * `inventoryMovements/{movementId}` — the audit trail for every source
 * of stock change this codebase actually tracks (§ Admin: Inventory,
 * § Inventory: batches, purchase orders, suppliers, movements,
 * low-stock alerts, expiry, audit trail): manual adjustments
 * (`restock`/`correction`/`damaged`/`other`), a received purchase
 * order (`purchase_order_received`), and a batch write-off
 * (`expired`/`written_off`). Deliberately still not a complete ledger
 * of every source of stock change — the automatic decrement
 * `packageRepository.reserveStockInTransaction` makes on every paid
 * order does NOT write here, since that path has no `businessId`/actor
 * context to attribute a movement to today; wiring that in is a real,
 * separate follow-up, not an oversight in this pass.
 */
export type InventoryMovementReason =
  | 'restock'
  | 'correction'
  | 'damaged'
  | 'other'
  | 'purchase_order_received'
  | 'expired'
  | 'written_off';

export interface InventoryMovement {
  businessId: string;
  packageId: string;
  /** Positive = stock added, negative = stock removed. */
  delta: number;
  /** The package's `stockCount` immediately after this movement — lets the ledger be read without re-deriving a running total. Null when the package doesn't track stock at all (an "unlimited" box) — a purchase-order receipt still records the batch/cost even then, but there is no real stock count to report. */
  resultingStockCount: number | null;
  reason: InventoryMovementReason;
  /** Set only when this movement came from a purchase-order receipt or a batch write-off — null for a manual adjustment, which has no batch to point to. */
  batchId: string | null;
  note: string | null;
  actor: string;
  createdAt: Timestamp;
}

import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `active` while any quantity remains and it hasn't expired;
 * `depleted` once `quantityRemaining` reaches 0 through normal sale
 * (§ InventoryService.adjustStock covers `stockCount`, but does not
 * itself touch a batch — batch depletion tracking is a future
 * refinement once checkout consumes specific batches, not fabricated
 * here); `expired`/`written_off` are terminal states reached only
 * through `InventoryService.writeOffBatch()`.
 */
export type InventoryBatchStatus = 'active' | 'depleted' | 'expired' | 'written_off';

/**
 * `inventoryBatches/{batchId}` — a real, traceable unit of received
 * stock (§ Inventory: batches, purchase orders, suppliers, movements,
 * low-stock alerts, expiry, audit trail). Created only by
 * `PurchaseOrderService.receivePurchaseOrder()` — there is no manual
 * "create a batch" path, since a batch's whole point is to record
 * *where* stock came from (which PO, which supplier, at what cost,
 * with what real expiry) at the moment it's actually known, not to be
 * a freeform ledger entry.
 */
export interface InventoryBatch extends AuditFields {
  businessId: string;
  packageId: string;
  purchaseOrderId: string;
  supplierId: string;
  quantityReceived: number;
  /** Decremented only by `InventoryService.writeOffBatch()` today — see `InventoryBatchStatus`'s comment on why sale-driven depletion isn't wired here yet. */
  quantityRemaining: number;
  unitCostKes: number;
  /** Null when the received goods have no real expiry (e.g. packaging, non-perishable inclusions) — never a fabricated date. */
  expiresAt: Timestamp | null;
  status: InventoryBatchStatus;
  receivedAt: Timestamp;
}

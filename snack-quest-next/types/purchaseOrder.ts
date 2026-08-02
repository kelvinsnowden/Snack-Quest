import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `draft` → `ordered` → `received` is the real lifecycle; `cancelled`
 * is reachable from `draft` or `ordered` only — a `received` PO can
 * never be cancelled, since receiving it already created real
 * `inventoryBatches` and incremented real stock (§ Inventory).
 */
export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrderLineItem {
  packageId: string;
  /** A human label for the line item — the package's name at order time, kept even if the package is later renamed. */
  description: string;
  quantity: number;
  unitCostKes: number;
}

export interface PurchaseOrderAuditEntry {
  action: string;
  actorId: string;
  at: Timestamp;
  note?: string;
}

/**
 * `purchaseOrders/{purchaseOrderId}` — a real order placed with a
 * supplier for stock (§ Inventory: batches, purchase orders,
 * suppliers, movements, low-stock alerts, expiry, audit trail).
 * `PurchaseOrderService.receivePurchaseOrder()` is the one place a PO
 * turns into real stock: it creates one `inventoryBatch` per line
 * item, one `inventoryMovements` entry per batch, and increments each
 * line item's `packages.stockCount`, all inside a single transaction —
 * a PO can never be marked received without the stock it promised
 * actually landing.
 */
export interface PurchaseOrder extends AuditFields {
  businessId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  lineItems: PurchaseOrderLineItem[];
  /** Sum of `lineItems[].quantity * lineItems[].unitCostKes` at creation time — not recomputed on receipt, since a line item's cost shouldn't silently drift after the order was placed. */
  totalCostKes: number;
  expectedDeliveryAt: Timestamp | null;
  orderedAt: Timestamp | null;
  receivedAt: Timestamp | null;
  cancelledAt: Timestamp | null;
  notes: string;
  auditTrail: PurchaseOrderAuditEntry[];
}

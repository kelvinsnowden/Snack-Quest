import type { AuditFields } from './common';

export interface FulfillmentBatchCosts {
  productsPurchasedKes: number;
  packagingKes: number;
  deliveryKes: number;
  miscKes: number;
  /** Sum of the four costs above at creation time — not recomputed later, matching `PurchaseOrder.totalCostKes`. */
  totalCostKes: number;
}

/**
 * `fulfillmentBatches/{batchId}` — one real shopping trip that covers
 * several orders at once (§ Fulfillment Batches). Snack Quest doesn't
 * buy snacks per order; it buys once for a group of orders, so this is
 * the record of that trip's real cost and what it actually made.
 *
 * No `status`/lifecycle field, unlike `PurchaseOrder` — there is no
 * "open" phase persisted here at all. Order selection happens
 * client-side before this doc ever exists; a batch is only ever
 * created by `FulfillmentBatchService.createFulfillmentBatch()`
 * already complete, matching `InventoryBatch`'s discipline: a batch's
 * whole point is to record where cost came from at the moment it's
 * known, not to be a freeform, later-editable ledger entry. Never
 * edited after creation — if an order inside it is later cancelled or
 * refunded, these totals intentionally do not get recomputed, same as
 * `InventoryBatch.unitCostKes` never drifting after receipt.
 *
 * Per-order allocated cost/profit is stored only on `Order` (see
 * `Order.fulfillment`), not duplicated here — one canonical copy of
 * each number, not two that could drift apart.
 */
export interface FulfillmentBatch extends AuditFields {
  businessId: string;
  /** String-ID references, not a subcollection or embedded order copies — every "which orders are in this batch" read is `Promise.all(orderIds.map(findById))`, needing no Firestore query or index. */
  orderIds: string[];
  orderCount: number;
  /** Sum of every batched order's `pricing.totalKes` at creation time. */
  totalRevenueKes: number;
  costs: FulfillmentBatchCosts;
  grossProfitKes: number;
  /** 0 when `totalRevenueKes` is 0, never a division-by-zero NaN. */
  profitMarginPct: number;
  notes: string;
}

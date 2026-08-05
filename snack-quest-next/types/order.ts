import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';
import type { DeliveryDetails } from './delivery';

/**
 * `pending` only ever exists transiently inside `OrderService`'s own
 * creation transaction (an order is created directly as `confirmed` —
 * it only exists at all because a payment already succeeded — see
 * `repositories/orderRepository.ts`'s `createInTransaction`). The
 * Admin Orders lifecycle (§ Admin: Orders) is: confirmed -> dispatched
 * -> delivered, or confirmed/dispatched/delivered -> refund_requested
 * -> refunded, or confirmed -> cancelled. `refund_requested` only ever
 * flags intent — the real M-Pesa reversal (§ RefundService + Daraja
 * reversal support) lives in the separate `refunds` collection;
 * `refunded` is set only once that reversal is confirmed, real proof
 * money actually moved back, not a status that pretends it did.
 */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded';

export interface OrderProduct {
  packageId: string;
  packageLabel: string;
}

export interface OrderCustomer {
  /** Nullable: the real, common case is a guest WhatsApp customer with no Firebase Auth account — `phoneNumber` is the identifier that always exists. */
  customerId: string | null;
  phoneNumber: string;
  customerName: string;
  county: string;
}

export interface OrderPayment {
  paymentIntentId: string;
  mpesaReceiptNumber: string | null;
}

export interface OrderPricing {
  subtotalKes: number;
  discountKes: number;
  deliveryFeeKes: number;
  creditsUsedKes: number;
  totalKes: number;
}

/**
 * `orders/{orderId}` — snack box orders (TDD §8, expanded per
 * PLATFORM_ARCHITECTURE_V2.md §16, restructured per the multi-delivery-
 * method redesign). Nested by concern (product/customer/delivery/
 * payment/pricing) rather than one flat bag of fields — `delivery` is
 * the same `DeliveryDetails` shape used by `ConversationCheckoutSnapshot`
 * and `DeliveryService`, so a new delivery method or provider never
 * requires touching this type. Created exactly once, by
 * `OrderService.createFromConversationSnapshot()`, only from a
 * succeeded payment.
 */
export interface Order extends AuditFields {
  businessId: string;
  product: OrderProduct;
  customer: OrderCustomer;
  delivery: DeliveryDetails;
  payment: OrderPayment;
  pricing: OrderPricing;
  conversationId: string;
  conversationCheckoutSnapshotId: string;
  status: OrderStatus;
  /** Set whenever a staff member changes `status` with a reason attached (e.g. a cancellation or refund note) — absent on orders whose status has never been changed with one. */
  statusReason?: string | null;
  referralLinkId: string | null;
  /**
   * Set once, atomically, by `FulfillmentBatchService.createFulfillmentBatch()`
   * (§ Fulfillment Batches) — null until this order is grouped into a real
   * shopping trip. Deliberately separate from `status`/`VALID_ORDER_TRANSITIONS`:
   * this is a fulfillment-cost concept, not a change to the order's own
   * confirmed/dispatched/delivered lifecycle.
   */
  fulfillmentBatchId: string | null;
  fulfillment: OrderFulfillment | null;
  /**
   * Set once, lazily, via an explicit "Assign recipe" action — never
   * during order creation. An order stays pinned to whichever recipe
   * version existed at assignment time even if the recipe is later
   * revised (§ Packing Recipes) — never re-points itself at a newer
   * version automatically.
   */
  packingRecipeVersionId: string | null;
  packing: OrderPacking | null;
}

/** Snapshotted once at the batch's creation time — never recomputed if the order's own pricing later changes. */
export interface OrderFulfillment {
  allocatedCostKes: number;
  orderRevenueKes: number;
  estimatedProfitKes: number;
}

export type OrderPackingStatus = 'not_started' | 'in_progress' | 'packed';

/**
 * Wholly additive and separate from `OrderStatus` (§ Admin: Orders) —
 * an order can be `delivered` (its real fulfillment status) and
 * simultaneously `packing.status: 'in_progress'` at the same time.
 * Nothing in `lib/orders/transitions.ts` or `OrderStatusActions.tsx`
 * reads or writes this.
 */
export interface OrderPacking {
  status: OrderPackingStatus;
  /** `RecipeItem.id`s the packer has checked off — validated server-side against the assigned recipe version before `markPacked()` accepts them, never trusted as complete just because the client says so. */
  checkedItemIds: string[];
  packedAt: Timestamp | null;
  packedBy: string | null;
}

/**
 * `orders/{orderId}/items/{itemId}` — one line item per box today
 * (the real journey is single-box-per-order; no cart, no per-snack
 * breakdown exists yet — this subcollection exists so multi-item
 * orders don't require a schema change later, not because today's
 * orders actually have more than one item).
 */
export interface OrderItem {
  packageId: string;
  packageLabel: string;
  quantity: number;
  unitCostKes: number;
}

import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';
import type { DeliveryDetails } from './delivery';
import type { ManualPaymentRecord } from './paymentIntent';
import type { GuaranteedPick } from './guaranteedPick';
import type { CheckoutLineItem } from './checkoutLine';

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
  /**
   * Every box on this order (§ more than one box per order), copied
   * off the frozen snapshot. Absent on every order placed before line
   * items existed — read it through `orderLines()`, never directly, or
   * those orders lose their box entirely.
   *
   * `packageId`/`packageLabel`/`quantity` remain the first line, so
   * the thirteen places that read them — including the warehouse
   * packing surfaces — keep working untouched.
   */
  items?: CheckoutLineItem[];
  /**
   * The snacks the customer chose to be certain of (§ Premium: choose
   * 5, discover the rest), copied off the frozen snapshot at order
   * creation — the same denormalisation `delivery` and `manualPayment`
   * use, and for the same reason: the packing list must be readable
   * without a join, and it records what was promised rather than what
   * the catalogue says today.
   *
   * Absent on every fully-curated box, which is what "the whole box is
   * a surprise" looks like in the data. The rest of a Premium box is
   * still curated by Snack Quest — these are a floor, never the whole
   * contents.
   */
  guaranteedPicks?: GuaranteedPick[];
}

export interface OrderCustomer {
  /** Nullable: the real, common case is a guest WhatsApp customer with no Firebase Auth account — `phoneNumber` is the identifier that always exists. */
  customerId: string | null;
  phoneNumber: string;
  customerName: string;
  /**
   * Optional, and website-checkout only (§ optional email capture) —
   * copied from the frozen snapshot when the order is created, so it
   * records the address given at purchase rather than whatever the
   * customer's latest one might be. Absent on every WhatsApp order,
   * every order predating the field, and every customer who left it
   * blank.
   */
  email?: string | null;
  county: string;
}

export interface OrderPayment {
  paymentIntentId: string;
  mpesaReceiptNumber: string | null;
  /**
   * Copied from the settling `PaymentIntent` when a super admin
   * recorded payment that arrived outside Daraja (§ super-admin manual
   * payment orders) — cash, a customer-initiated M-Pesa transfer, or a
   * bank transfer. Absent on every Daraja-settled order and on every
   * order predating this field.
   *
   * Denormalised rather than joined through `paymentIntentId` for the
   * same reason `delivery` and `attribution` are: the Admin order view
   * must be able to say "paid in cash, recorded by X" without a second
   * read, and this is a snapshot of what was asserted at the time, not
   * a live pointer.
   */
  manualPayment?: ManualPaymentRecord | null;
}

export interface OrderPricing {
  subtotalKes: number;
  discountKes: number;
  deliveryFeeKes: number;
  creditsUsedKes: number;
  totalKes: number;
  /**
   * What actually reached the business, when that is no longer
   * `totalKes` (§ correcting the box on an order).
   *
   * Absent on every order where the two agree, which is every order
   * that was never corrected — so its presence is exactly the signal
   * "this needs settling". It appears when the box on a paid order is
   * changed to one at a different price: the money that arrived is a
   * fact and does not move, so the difference is surfaced as a balance
   * to collect or refund rather than quietly written off by rewriting
   * one number to match the other.
   */
  amountPaidKes?: number;
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
  /**
   * A short, sequential, per-business number (`1`, `2`, …) — the
   * human-friendly reference a customer or staff member can actually
   * say out loud or type, unlike the raw Firestore document id.
   * Allocated once, atomically, alongside order creation itself (§
   * `OrderService.createFromConversationSnapshot`) via a per-business
   * counter document — never derived from the id or from `createdAt`,
   * since either could collide or reorder. Optional on this read type,
   * not because a new order can lack one, but because every order
   * created before this field existed genuinely has none — display
   * code must handle that absence rather than assume it.
   */
  orderNumber?: number;
  /** Set whenever a staff member changes `status` with a reason attached (e.g. a cancellation or refund note) — absent on orders whose status has never been changed with one. */
  statusReason?: string | null;
  referralLinkId: string | null;
  /**
   * `Conversation.attributionSnapshot` at the moment this order's
   * conversation began (§ close the loop: ad-conversion attribution) —
   * copied over once, at order creation, rather than requiring every
   * later report to join back through `conversationId`. Null for a
   * native WhatsApp-originated order (nothing to attribute to a web ad
   * click) and for every order that predates this field.
   */
  attribution: Record<string, unknown> | null;
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
  /**
   * When a staff member recorded that this customer was asked to leave
   * a review (§ Mission 2 — review acquisition). Absent on every order
   * that has never been asked, which is also every order predating this
   * field — so the "to ask" queue treats absent and null identically
   * and never needs a backfill.
   *
   * Deliberately records only that the ask happened, not how: the
   * outreach itself is manual today, and nothing in this codebase
   * sends it. Whether the customer then actually reviewed is answered
   * by the `reviews` collection, not duplicated here.
   */
  reviewRequestedAt?: Timestamp | null;
  /** Who recorded the ask. Absent for the same reason as `reviewRequestedAt`. */
  reviewRequestedBy?: string | null;
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

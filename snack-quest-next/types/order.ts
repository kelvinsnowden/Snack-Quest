import type { AuditFields } from './common';
import type { DeliveryDetails } from './delivery';

/**
 * `pending` only ever exists transiently inside `OrderService`'s own
 * creation transaction (an order is created directly as `confirmed` —
 * it only exists at all because a payment already succeeded — see
 * `repositories/orderRepository.ts`'s `createInTransaction`). The
 * Admin Orders lifecycle (§ Admin: Orders) is: confirmed -> dispatched
 * -> delivered, or confirmed/dispatched/delivered -> refund_requested,
 * or confirmed -> cancelled. `refund_requested` is a real, queryable,
 * audited state — not a real payment reversal, which doesn't exist
 * anywhere in this codebase yet (no Daraja B2C client, no
 * `RefundService`); it's the honest handoff point a future Finance
 * workflow resolves, not a status that pretends money already moved.
 */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refund_requested';

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

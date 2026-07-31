import type { AuditFields } from './common';
import type { DeliveryDetails } from './delivery';

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

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

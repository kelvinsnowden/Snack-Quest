import type { AuditFields } from './common';
import type { DeliveryMethod } from './conversation';

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

/**
 * `orders/{orderId}` — snack box orders (TDD §8, expanded per
 * PLATFORM_ARCHITECTURE_V2.md §16). `customerId` is nullable because
 * the real, common case is a guest WhatsApp customer with no Firebase
 * Auth account at all — `phoneNumber` is the identifier that always
 * exists. Created exactly once, by `OrderService
 * .createFromConversationSnapshot()`, only from a succeeded payment.
 */
export interface Order extends AuditFields {
  customerId: string | null;
  phoneNumber: string;
  customerName: string;
  county: string;
  conversationId: string;
  conversationCheckoutSnapshotId: string;
  paymentIntentId: string;
  packageId: string;
  totalAmountKes: number;
  creditsUsedKes: number;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  /** Human-readable: county + door address, or the pickup station name. */
  deliveryAddress: string;
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

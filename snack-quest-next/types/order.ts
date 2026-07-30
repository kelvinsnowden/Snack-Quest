import type { AuditFields } from './common';

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

/** `orders/{orderId}` — snack box orders. TDD §8. */
export interface Order extends AuditFields {
  customerId: string;
  packageId: string;
  totalAmountKes: number;
  creditsUsedKes: number;
  status: OrderStatus;
  deliveryAddress: string;
}

/** `orders/{orderId}/items/{itemId}` — subcollection, order line items. */
export interface OrderItem {
  snackId: string;
  quantity: number;
  unitCostKes: number;
}

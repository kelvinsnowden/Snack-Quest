import type { Timestamp } from 'firebase/firestore';
import type { DeliveryMethod } from './delivery';

/**
 * `shipments/{shipmentId}` — fulfillment, distinct from `orders.status`
 * (PLATFORM_ARCHITECTURE_V2.md §12). An order can be `confirmed` while
 * its shipment is still `pending` — different lifecycles, different
 * failure modes (a courier being down, or requiring a human to book
 * it, doesn't mean the order isn't paid).
 *
 * `pending_manual_booking` is the real state for a provider whose
 * `pricingMode` is 'manual' (Bolt today, see lib/delivery/providers.ts) —
 * no automated courier API created this shipment, a human agent still
 * has to book it themselves.
 */
export type ShipmentStatus =
  | 'pending'
  | 'pending_manual_booking'
  | 'created'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export interface Shipment {
  businessId: string;
  orderId: string;
  method: DeliveryMethod;
  provider: string;
  courierShipmentRef: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
  recipientName: string;
  recipientPhone: string;
  county: string;
  addressText: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

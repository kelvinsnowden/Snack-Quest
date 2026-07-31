import type { Timestamp } from 'firebase/firestore';

/**
 * `shipments/{shipmentId}` — fulfillment, distinct from `orders.status`
 * (PLATFORM_ARCHITECTURE_V2.md §12). An order can be `confirmed` while
 * its shipment is still `pending` — different lifecycles, different
 * failure modes (Jumia being down doesn't mean the order isn't paid).
 */
export type ShipmentStatus =
  | 'pending'
  | 'created'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export interface Shipment {
  orderId: string;
  courierShipmentRef: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
  recipientName: string;
  recipientPhone: string;
  county: string;
  deliveryMethod: 'door_delivery' | 'jumia_pickup';
  addressText: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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
 * `pricingMode` is 'manual' (Fargo, see lib/delivery/providers.ts) —
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

/**
 * One entry per real courier tracking update this shipment received
 * (§ Logistics: wire tracking webhook consumption) — `status` is the
 * courier's own raw status string, kept verbatim even
 * when it doesn't map to a `ShipmentStatus` transition, so the full
 * history is auditable regardless of whether this codebase's status
 * mapping (`lib/delivery/jumiaStatusMapping.ts`) recognized it.
 */
export interface ShipmentTrackingEvent {
  status: string;
  description: string | null;
  occurredAt: Timestamp;
}

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
  /** Every courier tracking update received, oldest first — the real audit trail behind `status`. */
  trackingEvents: ShipmentTrackingEvent[];
  /** Set the moment `status` first becomes `delivered` — the real timestamp delivery-performance analytics (§ Admin: Analytics) is computed from, distinct from `updatedAt` which changes on every field write. */
  deliveredAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

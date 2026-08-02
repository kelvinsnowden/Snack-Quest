/**
 * The shared delivery vocabulary (redesign: "Redesign Checkout &
 * Delivery Flow to Support Multiple Delivery Methods"). `method` is
 * the customer-facing choice; `provider` is which courier fulfills
 * it — kept separate so a future method (e.g. a second pickup network)
 * or a future provider for an existing method is a data change, never
 * a type change.
 *
 * `DeliveryDetails` is the one shape shared by `ConversationCheckoutSnapshot`,
 * `Order`, and the input to `DeliveryService` — the same object flows
 * from checkout freeze through to the shipment record, so nothing
 * downstream re-derives it from scratch.
 */

export type DeliveryMethod = 'pickup' | 'door';

/** A registry key (see lib/delivery/providers.ts), not a closed union — a new courier is a config entry, not a type change. */
export type DeliveryProvider = string;

/** Today's only method->provider mapping. Nothing prevents a method having more than one provider later (e.g. a second pickup network); this is just what's true today. */
export const DELIVERY_PROVIDER_FOR_METHOD: Record<DeliveryMethod, DeliveryProvider> = {
  pickup: 'jumia',
  door: 'bolt',
};

/**
 * Fulfillment lifecycle only — pricing/checkout state already lives on
 * `Conversation.status` and `ConversationCheckoutSnapshot.status`, so
 * this doesn't duplicate it. `pending_manual_booking` is Bolt's real
 * state today: a human agent must book the courier themselves: no
 * automated Bolt API integration exists (or is asked for) in this codebase.
 */
export type DeliveryStatus =
  | 'pending'
  | 'pending_manual_booking'
  | 'booked'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export interface DeliveryDetails {
  method: DeliveryMethod;
  provider: DeliveryProvider;
  status: DeliveryStatus;
  /** Business rule: Snack Quest ships only from Nairobi — always 'Nairobi' today, a string not a boolean so a second origin is a data change. */
  shippingOrigin: string;
  /** 0 until priced. Never fabricated — auto-computed for pickup, human-entered for door. */
  feeKes: number;
  county: string;
  /** Set only for method: 'pickup'. */
  pickupStationId: string | null;
  pickupStationName: string | null;
  /** Set only for method: 'door'. */
  addressText: string | null;
  landmark: string | null;
  estate: string | null;
  contactPhone: string | null;
  courierShipmentRef: string | null;
  trackingUrl: string | null;
}

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
  pickup: 'tushop',
  door: 'tushop',
};

/**
 * Fulfillment lifecycle only — pricing/checkout state already lives on
 * `Conversation.status` and `ConversationCheckoutSnapshot.status`, so
 * this doesn't duplicate it. `pending_manual_booking` is Fargo's real
 * state today: a human agent must book the courier themselves: no
 * automated courier API integration exists (or is asked for) in this codebase.
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

  /**
   * What Tushop is expected to bill Snack Quest for this delivery
   * (§ delivery margin). Never shown to a customer, never used to
   * price one.
   *
   * `feeKes` above is what the customer pays: a flat, published price
   * per speed. This is the courier's own distance-and-value formula.
   * They are deliberately independent — see `lib/delivery/courierCost.ts`
   * — and both are stored so the subsidy or margin on each delivery
   * type can be measured rather than assumed.
   *
   * Optional because orders placed before this existed do not have it,
   * and because it is an estimate: the distance term is billed on a
   * batched route the courier only computes later. `routeKmAssumed`
   * records whether the distance was known or stood in for, so a wrong
   * assumption can be recomputed instead of silently skewing the
   * history.
   */
  courierCost?: {
    estimatedKes: number;
    routeKm: number;
    routeKmAssumed: boolean;
    declaredValueKes: number;
  } | null;
  /**
   * Who the customer pays `feeKes` to, and when (§ delivery paid on
   * delivery).
   *
   * `'prepaid'` — the default and every website order: the fee is part
   * of the M-Pesa prompt and Snack Quest has the money before the box
   * moves.
   *
   * `'on_delivery'` — the customer settles it with the courier at the
   * door, or is not charged at all.
   *
   * The three differ in what is owed, not just in when:
   *
   * - `prepaid` — in the M-Pesa prompt, as on the website.
   * - `on_delivery` — excluded from the prompt, but `feeKes` still
   *   holds the real figure, because somebody has to know what to
   *   collect at the door. Recording it as 0 would lose that, and a
   *   courier cannot collect a number nobody kept.
   * - `waived` — nobody collects anything from the customer, so
   *   `feeKes` really is 0. Used when delivery is arranged outside the
   *   shop entirely (a Bolt ride the customer or the shop settles
   *   directly), where charging a fee here would be double-charging.
   *
   * Absent on every order placed before this existed, which means
   * prepaid — the only thing those could have been.
   */
  feeCollection?: 'prepaid' | 'on_delivery' | 'waived';
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

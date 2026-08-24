/**
 * One snack a customer chose to be certain of, on a box that lets them
 * choose (§ Premium: choose 5, discover the rest).
 *
 * Denormalised on purpose. The name, origin and photo are copied at
 * the moment of purchase rather than joined from `snackItems` later,
 * for the same reason the price is frozen onto the checkout snapshot:
 * a snack can be renamed, re-photographed or deactivated afterwards,
 * and the customer is owed what they actually picked. It also means
 * the packing list and the confirmation screen read one document
 * instead of fanning out to five.
 *
 * `snackItemId` is still carried, because fulfilment needs to reach
 * the real catalogue row — sourcing note, unit label, cost.
 */
export interface GuaranteedPick {
  snackItemId: string;
  /** As it was named when picked. */
  name: string;
  origin: string | null;
  imageUrl: string | null;
}

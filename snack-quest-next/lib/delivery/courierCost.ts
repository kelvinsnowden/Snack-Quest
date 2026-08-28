/**
 * What Tushop charges Snack Quest, which is not what Snack Quest
 * charges the customer (§ delivery margin).
 *
 * These are two independent numbers and this file exists to keep them
 * that way. The customer pays a flat, published price per speed —
 * KES 250 next day, 300 same day, 500 express — set in
 * `deliveryZoneRules` and editable in Admin. Tushop bills us a
 * distance-and-value formula that no customer ever sees. Deriving one
 * from the other would mean a customer's quote moving with how well
 * the courier happened to batch that afternoon's route, which is not
 * something to put in front of someone at checkout.
 *
 * Recording both is the point. A flat fee against a variable cost is a
 * subsidy on some orders and a margin on others, and the only way to
 * know which is to store the two side by side per order and look at
 * them later, by delivery type and over time.
 *
 * The estimate is honestly an estimate. The distance term is billed on
 * the *optimised, batched* route, which Tushop only knows after they
 * have decided what else is going on the same run — so at checkout the
 * best we have is a typical-distance assumption. The value term is
 * exact, because the declared order value is known the moment the
 * basket is priced. The real figure arrives on the monthly invoice and
 * is captured through the existing per-order cost entry in the
 * warehouse; this is what lets margin be watched before then.
 */

/** Tushop's per-kilometre rate on the optimised, batched route distance. */
export const TUSHOP_RATE_PER_KM_KES = 35;

/**
 * Tushop's charge on the declared order value, covering loss and
 * damage cover while the parcel is in their custody.
 */
export const TUSHOP_VALUE_RATE = 0.03;

/**
 * Stand-in for the batched route distance, in kilometres.
 *
 * Used only when a real distance is not known, which at checkout is
 * always: batching happens later and is Tushop's decision, not ours.
 * A deliberately middling Nairobi figure — the point of the estimate
 * is to be roughly right in aggregate so the subsidy per delivery type
 * is visible, not to be exact on any single order.
 *
 * Every order also stores the assumption it used, so if this number
 * turns out to be wrong the historical rows can be recomputed rather
 * than being quietly wrong forever.
 */
export const TUSHOP_ASSUMED_ROUTE_KM = 12;

export interface CourierCostEstimate {
  /** The whole estimate, rounded to whole shillings. */
  estimatedKes: number;
  /** The distance the estimate used, so a wrong assumption stays auditable. */
  routeKm: number;
  /** True when `routeKm` was the assumption rather than a known route. */
  routeKmAssumed: boolean;
  /** The order value the 3% was taken on. */
  declaredValueKes: number;
}

/**
 * Tushop's formula: KES 35 per optimised kilometre, plus 3% of the
 * declared order value.
 *
 * Never call this to price anything a customer sees. It answers "what
 * will this delivery cost us", and the answer belongs next to the fee
 * on the order, not in the quote.
 */
export function estimateCourierCost({
  declaredValueKes,
  routeKm,
}: {
  declaredValueKes: number;
  /** Omit when unknown, which at checkout it is. */
  routeKm?: number | null;
}): CourierCostEstimate {
  const assumed = routeKm == null || !Number.isFinite(routeKm) || routeKm < 0;
  const km = assumed ? TUSHOP_ASSUMED_ROUTE_KM : routeKm;
  const value = Number.isFinite(declaredValueKes) && declaredValueKes > 0 ? declaredValueKes : 0;

  return {
    estimatedKes: Math.round(km * TUSHOP_RATE_PER_KM_KES + value * TUSHOP_VALUE_RATE),
    routeKm: km,
    routeKmAssumed: assumed,
    declaredValueKes: value,
  };
}

/**
 * What the business makes, or gives away, on one delivery.
 *
 * Negative is a subsidy, and a subsidy is not automatically wrong —
 * express at KES 500 may well cost more than that and still be worth
 * selling. It just has to be visible.
 */
export function deliveryMarginKes(customerFeeKes: number, courierCostKes: number): number {
  return Math.round(customerFeeKes - courierCostKes);
}

import { describe, expect, it } from 'vitest';
import {
  deliveryMarginKes,
  estimateCourierCost,
  TUSHOP_ASSUMED_ROUTE_KM,
  TUSHOP_RATE_PER_KM_KES,
  TUSHOP_VALUE_RATE,
} from '@/lib/delivery/courierCost';
import { FARGO_SEED_FEES_KES } from '@/lib/delivery/deliveryPricing';

/**
 * What the courier charges Snack Quest, which is not what Snack Quest
 * charges the customer (§ delivery margin).
 *
 * The property under test throughout is that the two never meet. A
 * customer's delivery fee is a flat published price per speed; this
 * formula is the courier's own bill. If a future change ever wires one
 * into the other, a quote starts moving with how well a route batched
 * that afternoon, and these tests are what should stop it.
 */

describe('estimateCourierCost', () => {
  it('applies the courier formula: KES 35 per km plus 3% of order value', () => {
    const estimate = estimateCourierCost({ declaredValueKes: 5000, routeKm: 10 });

    // 10 * 35 = 350, plus 3% of 5000 = 150.
    expect(estimate.estimatedKes).toBe(500);
    expect(estimate.routeKm).toBe(10);
    expect(estimate.routeKmAssumed).toBe(false);
    expect(estimate.declaredValueKes).toBe(5000);
  });

  it('uses the documented rate constants rather than inlined numbers', () => {
    const km = 7;
    const value = 12_000;
    expect(estimateCourierCost({ declaredValueKes: value, routeKm: km }).estimatedKes).toBe(
      Math.round(km * TUSHOP_RATE_PER_KM_KES + value * TUSHOP_VALUE_RATE),
    );
  });

  /*
   * At checkout the batched route does not exist yet — the courier
   * computes it once they know what else is going out on the run. The
   * estimate has to say so, otherwise a stand-in distance would be
   * indistinguishable from a measured one when the margin figures are
   * read back months later.
   */
  it('flags the distance as assumed when no route is known', () => {
    const estimate = estimateCourierCost({ declaredValueKes: 5000 });

    expect(estimate.routeKm).toBe(TUSHOP_ASSUMED_ROUTE_KM);
    expect(estimate.routeKmAssumed).toBe(true);
  });

  it.each([null, undefined, -4, Number.NaN])(
    'falls back to the assumed distance for an unusable route value (%s)',
    (routeKm) => {
      const estimate = estimateCourierCost({ declaredValueKes: 1000, routeKm: routeKm as number });

      expect(estimate.routeKm).toBe(TUSHOP_ASSUMED_ROUTE_KM);
      expect(estimate.routeKmAssumed).toBe(true);
    },
  );

  /* A free or waived delivery still costs a courier run; the distance term stands alone. */
  it('still charges the distance term when the order value is zero', () => {
    expect(estimateCourierCost({ declaredValueKes: 0, routeKm: 10 }).estimatedKes).toBe(350);
  });
});

describe('deliveryMarginKes', () => {
  it('is positive when the customer fee covers the courier', () => {
    expect(deliveryMarginKes(500, 420)).toBe(80);
  });

  /*
   * Negative is a subsidy, and a subsidy is a legitimate commercial
   * choice — it just has to be visible rather than inferred. This is
   * the number the whole exercise exists to produce.
   */
  it('goes negative when the flat fee does not cover the run', () => {
    expect(deliveryMarginKes(250, 570)).toBe(-320);
  });
});

describe('the customer price and the courier cost stay independent', () => {
  /*
   * The published prices are the business's decision, set in
   * `deliveryZoneRules` and edited in Admin. The courier formula is
   * Tushop's. Nothing should make one a function of the other, so this
   * asserts the seeded fees are exactly the agreed figures and owes
   * nothing to the formula above.
   */
  it('publishes the agreed flat fees, not a computed one', () => {
    expect(FARGO_SEED_FEES_KES['Nairobi Metro — Next Day']).toBe(250);
    expect(FARGO_SEED_FEES_KES['Nairobi Metro — Same Day']).toBe(300);
    expect(FARGO_SEED_FEES_KES['Nairobi Metro — Express']).toBe(500);
  });

  /*
   * The clearest statement of the separation: two orders on the same
   * speed pay the same delivery fee, while their courier cost differs
   * with basket value. If these ever coincided, the fee would have
   * become a function of the formula.
   */
  it('charges one flat fee across baskets whose courier cost differs', () => {
    const cheap = estimateCourierCost({ declaredValueKes: 2000 });
    const dear = estimateCourierCost({ declaredValueKes: 20_000 });

    expect(cheap.estimatedKes).not.toBe(dear.estimatedKes);
    // Both are Same Day orders, and both are charged the same.
    expect(FARGO_SEED_FEES_KES['Nairobi Metro — Same Day']).toBe(300);
  });
});

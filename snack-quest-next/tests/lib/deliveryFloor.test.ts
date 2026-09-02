import { describe, expect, it } from 'vitest';
import { cheapestFeeKes } from '@/lib/delivery/deliveryFloor';

/**
 * The "delivery starts at KES 250" figure on the box step
 * (§ checkout load time).
 *
 * The rule this pins is which fees are allowed to count. A zone with
 * no rate card entered yet has a null fee, and treating that as zero
 * would advertise free delivery the business does not offer — a wrong
 * price is worse than an absent one, which is why an unpriced set
 * yields `null` and the line is hidden rather than showing 0.
 */

const rule = (feeKes: number | null | undefined) => ({ data: { feeKes } });

describe('cheapestFeeKes', () => {
  it('takes the lowest priced zone', () => {
    expect(cheapestFeeKes([rule(450), rule(250), rule(300)])).toBe(250);
  });

  /** An unpriced zone is not a free zone. */
  it('ignores zones with no fee entered', () => {
    expect(cheapestFeeKes([rule(null), rule(400), rule(undefined)])).toBe(400);
  });

  /*
   * Zero is how "not priced yet" shows up in older rows, and it means
   * the same thing as null. Letting it win would put "delivery starts
   * at KES 0" on the checkout.
   */
  it('does not let a zero fee become the advertised floor', () => {
    expect(cheapestFeeKes([rule(0), rule(300)])).toBe(300);
  });

  it('has no floor to quote when nothing is priced', () => {
    expect(cheapestFeeKes([rule(null), rule(0)])).toBeNull();
    expect(cheapestFeeKes([])).toBeNull();
  });
});

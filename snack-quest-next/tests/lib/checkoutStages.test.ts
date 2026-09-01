import { describe, expect, it } from 'vitest';
import { advanceLabelFor, stageForField, stagesFor } from '@/lib/checkout/stages';

/**
 * The checkout journey (§ checkout redesign).
 *
 * The stage list is derived per box rather than fixed, and everything
 * else — the progress indicator, which problems block which step, and
 * what the button says — reads from it. These pin the derivation, so a
 * later change cannot quietly reintroduce a step the journey does not
 * contain.
 */

describe('stagesFor', () => {
  it('runs four stages when the box has snacks to choose', () => {
    expect(stagesFor(true).map((stage) => stage.id)).toEqual([
      'box',
      'snacks',
      'details',
      'delivery',
    ]);
  });

  /*
   * A box with nothing to pick genuinely has three. A greyed-out
   * fourth stage the customer can never reach is a progress bar lying
   * about how long the journey is.
   */
  it('leaves the snacks stage out when there is nothing to pick', () => {
    expect(stagesFor(false).map((stage) => stage.id)).toEqual(['box', 'details', 'delivery']);
  });
});

describe('stageForField', () => {
  it('routes each problem to the stage that owns its field', () => {
    expect(stageForField('checkout-box')).toBe('box');
    expect(stageForField('checkout-picks')).toBe('snacks');
    expect(stageForField('checkout-name')).toBe('details');
    expect(stageForField('checkout-phone')).toBe('details');
    expect(stageForField('checkout-email')).toBe('details');
    expect(stageForField('checkout-address')).toBe('delivery');
    expect(stageForField('checkout-pickup')).toBe('delivery');
  });

  /*
   * Unknown fields fall to the last stage, which is the safe
   * direction: an unrecognised problem stops the payment rather than
   * being skipped past on the way to it.
   */
  it('sends anything unrecognised to the paying stage', () => {
    expect(stageForField('checkout-something-new')).toBe('delivery');
  });
});

describe('advanceLabelFor', () => {
  /*
   * Named after the stage it leads to, read from the list. Fixed
   * per-stage labels said "continue to snacks" on a box with no snacks
   * — the button promising a step the journey does not contain.
   */
  it('names the stage it actually leads to', () => {
    const withPicks = stagesFor(true);
    expect(advanceLabelFor(withPicks[1], null)).toBe('Continue to your snacks');

    const withoutPicks = stagesFor(false);
    expect(advanceLabelFor(withoutPicks[1], null)).toBe('Continue to your details');
  });

  /** The last stage pays, and says what it costs rather than leaving the customer to find the figure. */
  it('names the amount on the stage that charges it', () => {
    expect(advanceLabelFor(undefined, 'KES 3,750')).toBe('Pay KES 3,750 with M-Pesa');
  });

  /** No quote yet is not a reason to invent a number. */
  it('omits an amount it does not have', () => {
    expect(advanceLabelFor(undefined, null)).toBe('Pay with M-Pesa');
  });
});

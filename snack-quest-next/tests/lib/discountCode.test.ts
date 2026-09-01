import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  customerMessageFor,
  effectFor,
  isFullyDiscounted,
  normalizeDiscountCode,
  rejectionFor,
  validateDiscountCodeInput,
} from '@/lib/checkout/discountCode';
import type { DiscountCode } from '@/types/discountCode';

/**
 * Discount codes (§ discount codes).
 *
 * The demanding case throughout is the one these were asked for: a
 * 100% code for an influencer PR box, which is not a bigger discount
 * but a different kind of order.
 */

function code(overrides: Partial<DiscountCode> = {}): DiscountCode {
  return {
    businessId: 'biz-1',
    code: 'PRBOX',
    kind: 'percentage',
    value: 100,
    waivesDelivery: true,
    maxRedemptions: null,
    redemptionCount: 0,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    note: null,
    ...overrides,
  } as DiscountCode;
}

describe('normalizeDiscountCode', () => {
  it('matches however the customer typed it', () => {
    expect(normalizeDiscountCode('  prbox-10 ')).toBe('PRBOX-10');
  });
});

describe('rejectionFor', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('accepts a live code', () => {
    expect(rejectionFor(code(), now)).toBeNull();
  });

  it('refuses a code nobody issued', () => {
    expect(rejectionFor(null, now)).toBe('not_found');
  });

  /** Switched off rather than deleted, so its redemption history survives. */
  it('refuses a deactivated code', () => {
    expect(rejectionFor(code({ isActive: false }), now)).toBe('inactive');
  });

  it('refuses a code before it starts and after it expires', () => {
    const future = Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));
    const past = Timestamp.fromDate(new Date('2026-08-01T00:00:00Z'));
    expect(rejectionFor(code({ startsAt: future }), now)).toBe('not_started');
    expect(rejectionFor(code({ expiresAt: past }), now)).toBe('expired');
  });

  /** Expiry is exclusive: a code expiring at noon is dead at noon, not a second later. */
  it('treats the expiry instant itself as expired', () => {
    expect(rejectionFor(code({ expiresAt: Timestamp.fromDate(now) }), now)).toBe('expired');
  });

  it('refuses a code that has been used up', () => {
    expect(rejectionFor(code({ maxRedemptions: 1, redemptionCount: 1 }), now)).toBe(
      'fully_redeemed',
    );
    expect(rejectionFor(code({ maxRedemptions: 3, redemptionCount: 2 }), now)).toBeNull();
  });

  /** Unlimited is the absence of a limit, not a very large one. */
  it('never exhausts a code with no limit', () => {
    expect(rejectionFor(code({ maxRedemptions: null, redemptionCount: 9999 }), now)).toBeNull();
  });

  /*
   * A code that is both expired and used up reports as expired: that is
   * the fact the customer can do nothing about, and the one staff want
   * to see first.
   */
  it('reports expiry ahead of exhaustion', () => {
    const both = code({
      expiresAt: Timestamp.fromDate(new Date('2026-08-01T00:00:00Z')),
      maxRedemptions: 1,
      redemptionCount: 1,
    });
    expect(rejectionFor(both, now)).toBe('expired');
  });
});

describe('customerMessageFor', () => {
  /*
   * Every rejection but expiry says the same thing deliberately.
   * "Already used its maximum number of times" tells whoever is holding
   * a leaked code exactly how it failed, and a not-yet-live code should
   * not confirm to a stranger that it exists.
   */
  it('does not leak why, except for expiry', () => {
    expect(customerMessageFor('expired')).toMatch(/expired/i);
    for (const reason of ['not_found', 'inactive', 'not_started', 'fully_redeemed'] as const) {
      expect(customerMessageFor(reason)).toBe("That discount code isn't valid.");
    }
  });
});

describe('effectFor', () => {
  it('takes a percentage off the subtotal', () => {
    expect(effectFor(code({ kind: 'percentage', value: 25 }), 4000).discountKes).toBe(1000);
  });

  it('takes the whole subtotal at 100%', () => {
    expect(effectFor(code({ kind: 'percentage', value: 100 }), 3500).discountKes).toBe(3500);
  });

  it('takes a fixed amount', () => {
    expect(effectFor(code({ kind: 'fixed', value: 500 }), 3500).discountKes).toBe(500);
  });

  /* A discount larger than the order is a discount, not a payout. */
  it('never discounts more than the subtotal', () => {
    expect(effectFor(code({ kind: 'fixed', value: 5000 }), 3500).discountKes).toBe(3500);
  });

  it('rounds to whole shillings', () => {
    expect(effectFor(code({ kind: 'percentage', value: 33 }), 3500).discountKes).toBe(1155);
  });
});

describe('isFullyDiscounted', () => {
  /*
   * The question that changes the flow. A zero total has no M-Pesa
   * prompt to send and no callback to wait for, and asking Daraja to
   * collect nothing is an error rather than a free order.
   */
  it('is true only when nothing at all is being collected', () => {
    expect(isFullyDiscounted(0)).toBe(true);
    expect(isFullyDiscounted(1)).toBe(false);
    // Defensive: arithmetic that ever went negative is still a free
    // order, not a refund.
    expect(isFullyDiscounted(-50)).toBe(true);
  });
});

describe('validateDiscountCodeInput', () => {
  const valid = { code: 'PRBOX', kind: 'percentage', value: 100, maxRedemptions: 1 };

  it('accepts a 100% single-use PR code, which is the case this exists for', () => {
    expect(validateDiscountCodeInput(valid)).toBeNull();
  });

  it('rejects a percentage above 100', () => {
    expect(validateDiscountCodeInput({ ...valid, value: 101 })).toMatch(/cannot exceed 100/);
  });

  /** A fixed amount above the box price is legitimate — it just caps at the subtotal when applied. */
  it('allows a large fixed amount', () => {
    expect(validateDiscountCodeInput({ ...valid, kind: 'fixed', value: 10_000 })).toBeNull();
  });

  it('rejects a zero or negative discount', () => {
    expect(validateDiscountCodeInput({ ...valid, value: 0 })).toMatch(/greater than zero/);
    expect(validateDiscountCodeInput({ ...valid, value: -5 })).toMatch(/greater than zero/);
  });

  it('rejects a code that could not be read out over the phone', () => {
    expect(validateDiscountCodeInput({ ...valid, code: 'AB' })).toMatch(/at least 3/);
    expect(validateDiscountCodeInput({ ...valid, code: 'PR BOX!' })).toMatch(/letters, numbers/);
  });

  it('accepts a blank usage limit as unlimited, but not a fractional one', () => {
    expect(validateDiscountCodeInput({ ...valid, maxRedemptions: null })).toBeNull();
    expect(validateDiscountCodeInput({ ...valid, maxRedemptions: 0 })).toMatch(/at least 1/);
    expect(validateDiscountCodeInput({ ...valid, maxRedemptions: 1.5 })).toMatch(/whole number/);
  });
});

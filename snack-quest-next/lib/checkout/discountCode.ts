import {
  DISCOUNT_CODE_MAX_PERCENT,
  type DiscountCode,
  type DiscountCodeEffect,
  type DiscountCodeRejection,
} from '@/types/discountCode';

/**
 * Whether a discount code may be used, and what it takes off
 * (§ discount codes).
 *
 * Pure, and separate from the repository, because these are the rules
 * that have to be identical in three places that would otherwise each
 * grow their own version: the quote a customer sees while typing, the
 * charge that freezes the price, and the admin screen that says whether
 * a code is live. A code that quotes as valid and then fails at payment
 * is worse than one that never worked.
 *
 * Time is passed in rather than read here, so every caller can be
 * tested against a fixed clock and so an expiry is judged at the moment
 * the order is priced rather than whenever a module happened to load.
 */

/** Codes are matched case-insensitively; the id is the uppercased form. */
export function normalizeDiscountCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * The reason a code cannot be used, or null when it can.
 *
 * Ordered deliberately: a code that is both expired and fully redeemed
 * reports as expired, because that is the fact the customer can do
 * nothing about and the one staff need to see first.
 */
export function rejectionFor(
  code: DiscountCode | null,
  now: Date = new Date(),
): DiscountCodeRejection | null {
  if (!code) {
    return 'not_found';
  }
  if (!code.isActive) {
    return 'inactive';
  }
  const startsAtMs = code.startsAt?.toMillis?.();
  if (typeof startsAtMs === 'number' && now.getTime() < startsAtMs) {
    return 'not_started';
  }
  const expiresAtMs = code.expiresAt?.toMillis?.();
  if (typeof expiresAtMs === 'number' && now.getTime() >= expiresAtMs) {
    return 'expired';
  }
  if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) {
    return 'fully_redeemed';
  }
  return null;
}

/**
 * What to tell the customer.
 *
 * Every rejection except one says the same thing on purpose. "This code
 * has already been used its maximum number of times" tells whoever is
 * holding a leaked code exactly how the code failed, and a code that
 * exists but is not yet live should not confirm to a stranger that it
 * exists at all. Expiry is the exception: it is the one a customer
 * plausibly hit honestly, having been given a code last month.
 */
export function customerMessageFor(rejection: DiscountCodeRejection): string {
  return rejection === 'expired'
    ? 'That discount code has expired.'
    : "That discount code isn't valid.";
}

/**
 * What the code takes off a given subtotal.
 *
 * Capped at the subtotal, so a KES 5,000 fixed code against a KES 3,500
 * box discounts 3,500 and not a shilling more — a negative line would
 * turn a discount into a payout.
 */
export function effectFor(
  /*
   * The four fields pricing actually needs, rather than a whole
   * `DiscountCode`. The claim happens before the lines are priced, so
   * the caller carries these forward and resolves the amount later; a
   * full-document parameter would have forced a cast at that call site
   * to satisfy fields the arithmetic never touches.
   */
  code: Pick<DiscountCode, 'code' | 'kind' | 'value' | 'waivesDelivery'>,
  subtotalKes: number,
): DiscountCodeEffect {
  const raw =
    code.kind === 'percentage'
      ? (subtotalKes * Math.min(code.value, DISCOUNT_CODE_MAX_PERCENT)) / 100
      : code.value;

  return {
    code: code.code,
    kind: code.kind,
    value: code.value,
    // Rounded to whole shillings, the unit everything else in this
    // checkout is denominated in.
    discountKes: Math.min(Math.round(raw), Math.max(subtotalKes, 0)),
    waivesDelivery: code.waivesDelivery === true,
  };
}

/**
 * Whether this order collects no money at all.
 *
 * The question matters because the answer changes the whole flow: a
 * zero total has no M-Pesa prompt to send, no callback to wait for and
 * no receipt to quote, and asking Daraja to collect nothing is an error
 * rather than a free order.
 */
export function isFullyDiscounted(totalKes: number): boolean {
  return totalKes <= 0;
}

/** Validation shared by the admin create/edit form and its API route, so a bad code cannot be saved by going around the UI. */
export function validateDiscountCodeInput(input: {
  code: string;
  kind: string;
  value: number;
  maxRedemptions: number | null;
}): string | null {
  if (normalizeDiscountCode(input.code).length < 3) {
    return 'Code must be at least 3 characters.';
  }
  if (!/^[A-Z0-9-]+$/.test(normalizeDiscountCode(input.code))) {
    return 'Code can only contain letters, numbers and hyphens.';
  }
  if (input.kind !== 'percentage' && input.kind !== 'fixed') {
    return 'Discount must be a percentage or a fixed amount.';
  }
  if (!Number.isFinite(input.value) || input.value <= 0) {
    return 'Discount value must be greater than zero.';
  }
  if (input.kind === 'percentage' && input.value > DISCOUNT_CODE_MAX_PERCENT) {
    return `A percentage discount cannot exceed ${DISCOUNT_CODE_MAX_PERCENT}%.`;
  }
  if (
    input.maxRedemptions !== null &&
    (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)
  ) {
    return 'Usage limit must be a whole number of at least 1, or blank for unlimited.';
  }
  return null;
}

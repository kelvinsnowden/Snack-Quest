/**
 * The one arithmetic definition of what a Snack Quest order costs.
 * Pure, no I/O — the caller resolves the real box price, referral
 * discount, wallet credit and delivery fee from Firestore; this decides
 * what those add up to.
 *
 * Extracted so the quote a customer is shown before they pay and the
 * frozen snapshot they are actually charged against cannot disagree.
 * They are computed by this function, from the same inputs, on the same
 * request path — a quote that said one thing and a charge that said
 * another would be the single worst bug this checkout could have.
 *
 * Order of operations matters and is deliberate: the referral discount
 * comes off first, wallet credit is applied to what's left of the
 * order, and delivery is added last so credit never silently pays for
 * someone else's courier.
 */

export interface CheckoutPricingInputs {
  unitPriceKes: number;
  quantity: number;
  discountKes: number;
  walletCreditAppliedKes: number;
  deliveryFeeKes: number;
}

export interface CheckoutTotals {
  subtotalKes: number;
  discountKes: number;
  walletCreditAppliedKes: number;
  deliveryFeeKes: number;
  totalKes: number;
}

/** What wallet credit is allowed to be spent against, before delivery is added. */
export function redeemableCeilingKes(subtotalKes: number, discountKes: number): number {
  return Math.max(subtotalKes - discountKes, 0);
}

export function computeCheckoutTotals(inputs: CheckoutPricingInputs): CheckoutTotals {
  const subtotalKes = inputs.unitPriceKes * inputs.quantity;
  const discountKes = Math.min(inputs.discountKes, subtotalKes);
  const walletCreditAppliedKes = Math.min(
    inputs.walletCreditAppliedKes,
    redeemableCeilingKes(subtotalKes, discountKes),
  );

  return {
    subtotalKes,
    discountKes,
    walletCreditAppliedKes,
    deliveryFeeKes: inputs.deliveryFeeKes,
    totalKes: subtotalKes - discountKes - walletCreditAppliedKes + inputs.deliveryFeeKes,
  };
}

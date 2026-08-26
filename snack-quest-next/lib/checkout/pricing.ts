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

/**
 * A ceiling, not a stock rule — stock is checked separately against the
 * box's own `stockCount`. Shared between the client (the quantity
 * stepper's max) and the server (`ConversationService.startWebCheckout`'s
 * validation) so a typo or a scripted request can't freeze a snapshot
 * for an amount no real customer would ever be prompted to pay, and so
 * the two ceilings cannot drift apart into two different numbers.
 */
export const MAX_CHECKOUT_QUANTITY = 20;

export interface CheckoutPricingInputs {
  unitPriceKes: number;
  quantity: number;
  /**
   * Every box being bought (§ more than one box per order). When
   * present the subtotal is the sum across these lines; when absent it
   * is `unitPriceKes × quantity`, exactly as it always was.
   *
   * Both are accepted rather than replacing the pair, because this is
   * the one function that decides what a customer is charged and it is
   * shared by the live quote and the actual charge. A single-box order
   * must produce the identical number it produced yesterday, and the
   * surest way to guarantee that is to leave its arithmetic alone.
   */
  lines?: { unitPriceKes: number; quantity: number }[];
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
  const subtotalKes = inputs.lines?.length
    ? inputs.lines.reduce((sum, line) => sum + line.unitPriceKes * line.quantity, 0)
    : inputs.unitPriceKes * inputs.quantity;
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

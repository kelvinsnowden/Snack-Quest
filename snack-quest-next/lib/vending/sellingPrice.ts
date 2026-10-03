/**
 * What a machine charges for a product (§ ONE PRICE): the product's price
 * override on that machine's assortment when one is set, otherwise the
 * slot's price. The customer screen shows this and the payment charges
 * this — they are computed by this one function, so the price on the
 * screen and the amount on the M-Pesa prompt can never differ.
 */
export function effectiveSellingPriceKes(input: { slotPriceKes: number; assortmentOverrideKes?: number | null }): number {
  return input.assortmentOverrideKes ?? input.slotPriceKes;
}

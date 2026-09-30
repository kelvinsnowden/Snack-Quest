import type { SaleEconomicsSnapshot } from '@/types/economics';

/**
 * The financial engine (§ MARGIN DEFINITIONS, docs/OS_MASTER_GAP_ANALYSIS.md
 * §3.3). Every margin, profit and contribution figure the product shows is
 * computed here and nowhere else — settlement, the machine P&L, the owner
 * portal and the admin dashboard all call these functions.
 *
 * The definitions, in order:
 *
 *   Gross revenue − discounts − refunds          = Net revenue
 *   Net revenue (of sales with a known cost) − COGS = Gross profit
 *   Gross profit ÷ that net revenue               = Gross margin
 *   Gross profit − payment fees − owner share − location commission
 *     − subscription − maintenance − other direct costs + ad revenue
 *                                                 = Contribution profit
 *
 * Two rules keep the numbers honest:
 * - A sale whose cost isn't known is never costed at zero. It counts in
 *   net revenue, is left out of gross profit and margin, and is reported
 *   (`unpricedUnits`, `unpricedNetRevenueKes`) so the reader knows profit
 *   covers only the sales it can.
 * - A cost the system doesn't have (payment fees before they are
 *   configured, a location commission nobody recorded) is left out of
 *   contribution and named in `missing` — never assumed to be zero.
 *
 * "Net profit" is never used: nothing here holds every operating cost.
 */

/** Whose books a figure is for. The owner's cost of a product is what they pay for it; Snack Quest's is its landed cost. */
export type EconomicPerspective = 'snack_quest' | 'owner';

/** Unit cost of one sale from one perspective, read from the sale's frozen snapshot. Null when that cost wasn't recorded. */
export function unitCostFor(snapshot: Pick<SaleEconomicsSnapshot, 'landedCostKes' | 'ownerWholesaleKes' | 'ownerCostBasis'>, perspective: EconomicPerspective): number | null {
  if (perspective === 'snack_quest') return snapshot.landedCostKes;
  return snapshot.ownerCostBasis === 'wholesale_price' ? snapshot.ownerWholesaleKes : snapshot.landedCostKes;
}

/** One group of units sold at one price — usually one sale. Money in whole shillings. */
export interface SaleLine {
  units: number;
  /** Price × units before any discount. */
  grossKes: number;
  discountKes?: number;
  /** Money given back for this line after it counted as a sale. */
  refundKes?: number;
  /** Cost of one unit from the perspective being computed; null when unknown. */
  unitCostKes: number | null;
}

export interface ProductEconomics {
  units: number;
  grossRevenueKes: number;
  discountsKes: number;
  refundsKes: number;
  netRevenueKes: number;
  /** Cost of the units whose cost is known. */
  cogsKes: number;
  /** Net revenue of the units whose cost is known — the base gross profit and margin are computed on. */
  costedNetRevenueKes: number;
  grossProfitKes: number;
  /** Percent, one decimal; null when there is no costed revenue to divide by. */
  grossMarginPct: number | null;
  unpricedUnits: number;
  unpricedNetRevenueKes: number;
}

export function marginPct(profitKes: number, revenueKes: number): number | null {
  if (revenueKes <= 0) return null;
  return Math.round((profitKes / revenueKes) * 1000) / 10;
}

export function productEconomics(lines: readonly SaleLine[]): ProductEconomics {
  let units = 0;
  let grossRevenueKes = 0;
  let discountsKes = 0;
  let refundsKes = 0;
  let cogsKes = 0;
  let costedNetRevenueKes = 0;
  let unpricedUnits = 0;
  let unpricedNetRevenueKes = 0;
  for (const line of lines) {
    const discount = line.discountKes ?? 0;
    const refund = line.refundKes ?? 0;
    const net = line.grossKes - discount - refund;
    units += line.units;
    grossRevenueKes += line.grossKes;
    discountsKes += discount;
    refundsKes += refund;
    if (line.unitCostKes === null) {
      unpricedUnits += line.units;
      unpricedNetRevenueKes += net;
    } else {
      cogsKes += line.unitCostKes * line.units;
      costedNetRevenueKes += net;
    }
  }
  const netRevenueKes = grossRevenueKes - discountsKes - refundsKes;
  const grossProfitKes = costedNetRevenueKes - cogsKes;
  return {
    units,
    grossRevenueKes,
    discountsKes,
    refundsKes,
    netRevenueKes,
    cogsKes,
    costedNetRevenueKes,
    grossProfitKes,
    grossMarginPct: marginPct(grossProfitKes, costedNetRevenueKes),
    unpricedUnits,
    unpricedNetRevenueKes,
  };
}

/** The costs and income below gross profit. `null` means "not known" — it is left out and reported, never treated as zero. */
export interface ContributionInputs {
  paymentFeesKes: number | null;
  ownerShareKes?: number;
  locationCommissionKes: number | null;
  subscriptionKes?: number;
  /** Null when maintenance costs aren't recorded for this machine. */
  maintenanceKes?: number | null;
  otherDirectCostsKes?: number;
  adRevenueKes?: number;
}

export interface ContributionLine {
  key: 'payment_fees' | 'owner_share' | 'location_commission' | 'subscription' | 'maintenance' | 'other_direct_costs' | 'ad_revenue';
  label: string;
  /** Signed: costs negative, income positive. Null when unknown. */
  amountKes: number | null;
}

export interface Contribution {
  grossProfitKes: number;
  lines: ContributionLine[];
  contributionProfitKes: number;
  /** Contribution ÷ costed net revenue, like gross margin; null without costed revenue. */
  contributionMarginPct: number | null;
  /** Lines left out because the amount isn't known. */
  missing: ContributionLine['key'][];
}

export function contribution(product: Pick<ProductEconomics, 'grossProfitKes' | 'costedNetRevenueKes'>, inputs: ContributionInputs): Contribution {
  const cost = (value: number | null | undefined): number | null => (value === null ? null : -(value ?? 0));
  const lines: ContributionLine[] = [
    { key: 'payment_fees', label: 'Payment processing fees', amountKes: cost(inputs.paymentFeesKes) },
    { key: 'owner_share', label: 'Owner share', amountKes: cost(inputs.ownerShareKes) },
    { key: 'location_commission', label: 'Location commission', amountKes: cost(inputs.locationCommissionKes) },
    { key: 'subscription', label: 'Subscription', amountKes: cost(inputs.subscriptionKes) },
    { key: 'maintenance', label: 'Maintenance', amountKes: cost(inputs.maintenanceKes) },
    { key: 'other_direct_costs', label: 'Other direct costs', amountKes: cost(inputs.otherDirectCostsKes) },
    { key: 'ad_revenue', label: 'Advertising revenue', amountKes: inputs.adRevenueKes ?? 0 },
  ];
  const contributionProfitKes = product.grossProfitKes + lines.reduce((sum, line) => sum + (line.amountKes ?? 0), 0);
  return {
    grossProfitKes: product.grossProfitKes,
    lines,
    contributionProfitKes,
    contributionMarginPct: marginPct(contributionProfitKes, product.costedNetRevenueKes),
    missing: lines.filter((line) => line.amountKes === null).map((line) => line.key),
  };
}

/**
 * Snack Quest's margin on stock it sold to an owner: (wholesale − landed)
 * per unit. Units missing either price are counted, not guessed.
 */
export function wholesaleMargin(lines: readonly { units: number; ownerWholesaleKes: number | null; landedCostKes: number | null }[]): {
  units: number;
  wholesaleRevenueKes: number;
  landedCostKes: number;
  marginKes: number;
  marginPct: number | null;
  unpricedUnits: number;
} {
  let units = 0;
  let wholesaleRevenueKes = 0;
  let landedCostKes = 0;
  let unpricedUnits = 0;
  for (const line of lines) {
    if (line.ownerWholesaleKes === null || line.landedCostKes === null) {
      unpricedUnits += line.units;
      continue;
    }
    units += line.units;
    wholesaleRevenueKes += line.ownerWholesaleKes * line.units;
    landedCostKes += line.landedCostKes * line.units;
  }
  const marginKes = wholesaleRevenueKes - landedCostKes;
  return { units, wholesaleRevenueKes, landedCostKes, marginKes, marginPct: marginPct(marginKes, wholesaleRevenueKes), unpricedUnits };
}

/** A percentage share of an amount, rounded to the shilling. */
export function shareOf(amountKes: number, pct: number): number {
  return Math.round((amountKes * pct) / 100);
}

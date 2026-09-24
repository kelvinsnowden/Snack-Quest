import type { Timestamp } from 'firebase/firestore';

/**
 * `networkDailySummary/{businessId}__{date}` — the whole fleet's read
 * model for one day (§ NETWORK INTELLIGENCE: "Use rollups. Do not scan
 * raw transaction collections on every dashboard"). Exactly the
 * `partnerDailySummary` primitive one level up: composed by summing
 * every one of this business's own `machineDailySummary` documents for
 * the day, never by re-streaming raw transactions — the same
 * "compose from the smaller rollup" shape `docs/ANALYTICS_ROLLUPS.md`
 * §4 already establishes.
 *
 * `byCategory` is the one thing `partnerDailySummary` doesn't need
 * that a network dashboard does — "top categories, fastest-growing
 * categories" (§ NETWORK INTELLIGENCE) reads this directly rather than
 * re-deriving it from every machine's own `byProduct` on every
 * request.
 */
export interface NetworkDailySummary {
  businessId: string;
  date: string;
  /** How many machines existed as of the rebuild — not necessarily how many transacted that day. */
  machineCount: number;
  transactionCount: number;
  dispensedCount: number;
  grossSalesKes: number;
  refundsKes: number;
  unitsSold: number;
  cogsKes: number;
  grossProfitKes: number;
  /** Units sold whose cost could not be resolved that day, summed across every machine — never folded into `cogsKes`. */
  unpricedUnitsSold: number;
  faultCount: number;
  /** The sum, across every machine, of `MachineDailySummary.stockoutProductIds.length` — a fleet-wide count of (machine, product) stockout snapshots, not a count of distinct products. */
  stockoutSnapshotCount: number;
  byCategory: Record<string, { unitsSold: number; grossSalesKes: number; cogsKes: number; grossProfitKes: number }>;
  rebuiltAt: Timestamp;
}

export function networkDailySummaryDocId(businessId: string, date: string): string {
  return `${businessId}__${date}`;
}

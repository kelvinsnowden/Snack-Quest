import type { Timestamp } from 'firebase/firestore';

/**
 * `machineDailySummary/{machineId}__{date}` — one machine's read
 * model for one day (§ ANALYTICS, docs/ANALYTICS_ROLLUPS.md §3,
 * docs/FLEET_ARCHITECTURE_AUDIT.md §6). Exactly the `trafficDaily`
 * primitive with vending's own counted fields: rebuilt from
 * `machineTransactions`, `machineInventoryMovements` and
 * `machineTelemetryEvents` rather than scanned live, and sharded by
 * machine+day for the same reason `trafficDaily` is sharded by
 * business+day — many small documents, never one fleet-wide counter
 * that every machine's write would contend on.
 *
 * `heartbeatCount`/`faultCount` are raw counts, not a derived uptime
 * percentage — turning a heartbeat cadence into an uptime percentage
 * would require assuming an interval nothing here actually guarantees,
 * and an invented uptime number is exactly the kind of unearned
 * precision the brief's "do not invent commercial terms" instruction
 * warns against one level up, for settlements. This stays at what the
 * telemetry stream actually proves: how many heartbeats and how many
 * faults were reported that day.
 *
 * `byProduct[...].cogsKes`/`grossProfitKes`/`category` and
 * `unpricedUnitsSold`/`stockoutProductIds` are Snack Intelligence's own
 * additions (§ PRODUCT INTELLIGENCE, § STOCKOUT INTELLIGENCE,
 * docs/SNACK_INTELLIGENCE.md) — additive to the fields above, which
 * predate that phase and keep their exact original meaning.
 */
export interface MachineDailySummary {
  businessId: string;
  machineId: string;
  /** `YYYY-MM-DD`, UTC — same convention as `TrafficDaily.date`. */
  date: string;
  /** Every transaction created that day, regardless of outcome. */
  transactionCount: number;
  dispensedCount: number;
  /** Paid, but the vend failed — a refund obligation, counted separately from a clean dispense per the financial-correctness split `MachineTransactionStatus` itself encodes. */
  paidVendFailedCount: number;
  grossSalesKes: number;
  refundsKes: number;
  unitsSold: number;
  /** `grossSalesKes / dispensedCount`, null when nothing dispensed that day rather than a division by zero pretending to be a number. */
  averageOrderValueKes: number | null;
  /**
   * `cogsKes` is resolved from the *transaction's own* recorded
   * `productId`/`productCatalogue` (captured at the moment of sale,
   * never a later slot/price change) against `SnackItem.expectedUnitCostKes`
   * — `0` for a `package`-catalogue sale or any `snackItem` lookup miss,
   * which is exactly what `unpricedUnitsSold` (below) counts, never
   * silently treated as a real zero cost. `grossProfitKes` is
   * `grossSalesKes - cogsKes` for that product; `category` is this
   * machine's own `MachineAssortment.category` for the product at
   * rollup time — null if the product was never assorted with a
   * category, or is no longer assorted to this machine at all.
   */
  byProduct: Record<string, { unitsSold: number; grossSalesKes: number; cogsKes: number; grossProfitKes: number; category: string | null }>;
  /** Units dispensed whose cost could not be resolved (package catalogue, or a snackItem no longer found) — never folded into `cogsKes` as an invented zero. */
  unpricedUnitsSold: number;
  /**
   * A point-in-time snapshot, taken when this rollup was built (not a
   * continuous intra-day trace): every product this machine had
   * `assorted && visible` whose linked slot reported zero sellable
   * quantity at that moment. A real signal for "was this product out
   * of stock around the time this day closed," not proof of *when*
   * during the day it ran out or for how long — `docs/SNACK_INTELLIGENCE.md`
   * states this limitation directly rather than implying finer
   * granularity than a daily rollup can actually carry.
   */
  stockoutProductIds: string[];
  /** `machineInventoryMovements` with `reason: 'restock'` that day — the restock-frequency signal. */
  restockCount: number;
  /** `machineTelemetryEvents` with `eventType: 'fault'` that day. */
  faultCount: number;
  /** `machineTelemetryEvents` with `eventType: 'heartbeat'` that day. */
  heartbeatCount: number;
  rebuiltAt: Timestamp;
}

export function machineDailySummaryDocId(machineId: string, date: string): string {
  return `${machineId}__${date}`;
}

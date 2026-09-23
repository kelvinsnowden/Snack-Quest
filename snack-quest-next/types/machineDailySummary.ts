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
  byProduct: Record<string, { unitsSold: number; grossSalesKes: number }>;
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

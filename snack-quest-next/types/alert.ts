import type { Timestamp } from 'firebase/firestore';

/**
 * `alerts/{alertId}` — the fleet-wide Alert Center (§ PART 6 — ALERT
 * CENTER: "Machine offline, Heartbeat missing, Stockout, Stockout
 * risk, Machine fault, Payment reconciliation issue, Inventory
 * discrepancy, Expiry risk, Subscription issue, Settlement failure.
 * Each alert: severity, type, machine, location, timestamp, status,
 * assignee, resolution").
 *
 * Two different lifecycles share this one collection, distinguished
 * by how `alertService.evaluateAndSync` writes them — never by a
 * field on the document itself, since a reader of an alert doesn't
 * need to know which:
 *
 *   - **Condition alerts** (`machine_offline`, `heartbeat_missing`,
 *     `stockout`, `stockout_risk`, `payment_reconciliation_issue`,
 *     `subscription_issue`, `settlement_failure`, `expiry_risk`) —
 *     "is this still true right now." `dedupeKey` is stable per
 *     (type, machine[, slot]) and reused indefinitely: resolving one
 *     while its underlying condition is still true lets the next
 *     sweep reopen it (real alerting has to be able to re-fire), and
 *     the sweep auto-resolves any open alert whose condition it no
 *     longer finds true.
 *   - **Event alerts** (`machine_fault`, `inventory_discrepancy`) —
 *     "this happened once." `dedupeKey` embeds the source event/
 *     movement id, so each real-world occurrence gets exactly one
 *     alert, ever — never auto-resolved (there is no "fault cleared"
 *     signal to detect), always waiting on a human to acknowledge or
 *     resolve it.
 */
export type AlertType =
  | 'machine_offline'
  | 'heartbeat_missing'
  | 'stockout'
  | 'stockout_risk'
  | 'machine_fault'
  | 'payment_reconciliation_issue'
  | 'inventory_discrepancy'
  | 'expiry_risk'
  | 'subscription_issue'
  | 'settlement_failure';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface Alert {
  businessId: string;
  type: AlertType;
  severity: AlertSeverity;
  /** Null only for a fleet-level condition with no single machine at fault — every alert type this service currently raises has one, but the field stays nullable rather than assumed. */
  machineId: string | null;
  locationId: string | null;
  title: string;
  detail: string;
  /** See this type's own doc comment above for the two distinct meanings this takes depending on `type`. */
  dedupeKey: string;
  status: AlertStatus;
  assignee: string | null;
  resolution: string | null;
  resolvedAt: Timestamp | null;
  resolvedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** The severity `alertService` assigns each type — a fixed table, not a per-alert judgement call, so the same condition always reads the same urgency across the whole fleet. */
export const ALERT_SEVERITY_BY_TYPE: Record<AlertType, AlertSeverity> = {
  machine_offline: 'critical',
  heartbeat_missing: 'warning',
  stockout: 'critical',
  stockout_risk: 'warning',
  machine_fault: 'critical',
  payment_reconciliation_issue: 'warning',
  inventory_discrepancy: 'warning',
  expiry_risk: 'warning',
  subscription_issue: 'warning',
  settlement_failure: 'critical',
};

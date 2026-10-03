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
  | 'settlement_failure'
  /** A machine's outcome report contradicted a money decision already made — see `MachineTransaction.outcomeConflict`. */
  | 'dispense_conflict'
  /** A machine integration is misbehaving at the protocol level: rate-limited, sending invalid requests, or on uncertified firmware. */
  | 'integration_issue'
  /** Most of one manufacturer's machines went silent together — the manufacturer's cloud (or its link to us) is the likely cause, not the machines. */
  | 'manufacturer_outage'
  /** A scheduled job (recovery, reconciliation, rollups) failed, partly failed, was abandoned mid-run, or has not run on schedule. Condition alert, one per job. */
  | 'job_failure'
  /** Repeated failed or unresolved dispenses on one machine within an hour. */
  | 'dispense_failures'
  /** An abnormal share of one manufacturer's dispenses ended with no known outcome (timeout/unknown). */
  | 'dispense_timeout_rate'
  /** Snack Quest cannot reach an outbound manufacturer's API from most of its machines. */
  | 'manufacturer_api_unavailable'
  /** A manufacturer's own keys are failing authentication (revoked, expired, wrong secret, clock). */
  | 'integration_auth_failures'
  /** A signing key expires soon, or a rotation grace ends while the old key is still in use. */
  | 'credential_expiring'
  /** A revoked credential is still needed: Snack Quest's API key for a manufacturer with active machines. */
  | 'credential_revoked'
  /** A manufacturer's authenticated webhook deliveries are being refused. */
  | 'webhook_failures';

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
  /** When operators were texted about it (critical alerts only). Absent until then. */
  notifiedAt?: Timestamp | null;
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
  dispense_conflict: 'critical',
  integration_issue: 'warning',
  manufacturer_outage: 'critical',
  job_failure: 'warning',
  dispense_failures: 'critical',
  dispense_timeout_rate: 'warning',
  manufacturer_api_unavailable: 'critical',
  integration_auth_failures: 'critical',
  credential_expiring: 'warning',
  credential_revoked: 'critical',
  webhook_failures: 'warning',
};

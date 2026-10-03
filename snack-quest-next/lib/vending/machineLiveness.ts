/**
 * Machine liveness — whether a machine is reachable and able to serve a
 * customer right now. Deliberately separate from *integration health*
 * (`integrationHealth.ts`, "is the connection working correctly?"): a
 * machine can be ONLINE on a degraded integration, and a healthy
 * integration can have an OFFLINE machine.
 *
 * Definitions (E = the machine's expected heartbeat interval, 60 s by
 * default; G = grace for network delay and scheduling jitter,
 * max(30 s, E/2); "contact" = the latest authenticated request from the
 * machine or its manufacturer — heartbeat, any API call, webhook —
 * timed by **Snack Quest's clock at receipt**, never the machine's, so
 * a wrong machine clock cannot make it look alive or dead):
 *
 * | State    | Meaning                                                                 |
 * |----------|-------------------------------------------------------------------------|
 * | ONLINE   | contact within E + G, and the machine isn't reporting itself offline    |
 * | DEGRADED | contact within 3E + G — one or two heartbeats missed; could be network  |
 * | OFFLINE  | silent beyond 3E + G after having been heard, *or* it says it is offline, *or* staff put it in maintenance (`planned`) |
 * | UNKNOWN  | not heard since it was (re)configured — or its whole manufacturer went silent at once, which points at their cloud or ours, not at this machine |
 *
 * "Haven't heard from it yet" is UNKNOWN, never OFFLINE: a machine that
 * was just registered, or whose manufacturer is having an outage, isn't
 * known to be off — and alerting on it as if it were would bury real
 * failures in noise.
 */

import type { MachineIntegration } from '@/types';

export type MachineLivenessState = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';

export type MachineLivenessReason =
  | 'responding'
  | 'missed_heartbeats'
  | 'silent'
  | 'reports_offline'
  | 'maintenance'
  | 'never_heard'
  | 'manufacturer_outage_suspected';

export interface MachineLiveness {
  state: MachineLivenessState;
  reason: MachineLivenessReason;
  /** Staff-declared downtime — suppresses offline alerts. */
  planned: boolean;
  lastContactAt: Date | null;
  secondsSinceContact: number | null;
  /** Safe to take a customer's money for this machine: ONLINE and heard from recently enough to collect a queued command before it expires. */
  canAcceptOrders: boolean;
}

export interface LivenessInput {
  lastContactAt: Date | null;
  /** When the integration was last (re)configured — contact before this doesn't count. */
  configuredAt: Date | null;
  expectedIntervalSeconds?: number | null;
  /** The machine's own last `online` flag, if it has reported one. */
  reportedOnline?: boolean | null;
  maintenanceUntil?: Date | null;
  /** True when most of this machine's manufacturer's fleet went silent together (see `detectManufacturerSilence`). */
  manufacturerSilent?: boolean;
  now?: Date;
}

export const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 60;
/** Orders need a machine heard from within this long — comfortably inside the 2-minute queued-command window. */
export const ORDER_FRESHNESS_SECONDS = 90;

export function graceSeconds(expectedIntervalSeconds: number): number {
  return Math.max(30, Math.round(expectedIntervalSeconds / 2));
}

export function deriveMachineLiveness(input: LivenessInput): MachineLiveness {
  const now = input.now ?? new Date();
  const interval = input.expectedIntervalSeconds && input.expectedIntervalSeconds > 0 ? input.expectedIntervalSeconds : DEFAULT_HEARTBEAT_INTERVAL_SECONDS;
  const grace = graceSeconds(interval);
  const contact = input.lastContactAt && (!input.configuredAt || input.lastContactAt >= input.configuredAt) ? input.lastContactAt : null;
  const seconds = contact ? Math.max(0, (now.getTime() - contact.getTime()) / 1000) : null;
  const result = (state: MachineLivenessState, reason: MachineLivenessReason, planned = false): MachineLiveness => ({
    state,
    reason,
    planned,
    lastContactAt: contact,
    secondsSinceContact: seconds === null ? null : Math.round(seconds),
    canAcceptOrders: state === 'ONLINE' && seconds !== null && seconds <= ORDER_FRESHNESS_SECONDS,
  });

  if (input.maintenanceUntil && input.maintenanceUntil > now) {
    return result('OFFLINE', 'maintenance', true);
  }
  if (seconds === null) {
    return result('UNKNOWN', 'never_heard');
  }
  if (seconds <= interval + grace) {
    return input.reportedOnline === false ? result('OFFLINE', 'reports_offline') : result('ONLINE', 'responding');
  }
  if (input.manufacturerSilent) {
    return result('UNKNOWN', 'manufacturer_outage_suspected');
  }
  if (seconds <= 3 * interval + grace) {
    return result('DEGRADED', 'missed_heartbeats');
  }
  return result('OFFLINE', 'silent');
}

/**
 * A manufacturer-wide silence is not N machine failures. If at least
 * `minMachines` of a manufacturer's active machines were all last heard
 * from inside one short window and all went quiet, and that covers most
 * of the fleet, the likelier story is their cloud (or ours) — so those
 * machines read UNKNOWN and one manufacturer-level alert is raised
 * instead of one per machine.
 */
export function detectManufacturerSilence(
  lastContacts: (Date | null)[],
  options: { now?: Date; silentAfterSeconds?: number; minMachines?: number; minFraction?: number } = {},
): boolean {
  const now = options.now ?? new Date();
  const silentAfter = options.silentAfterSeconds ?? 3 * DEFAULT_HEARTBEAT_INTERVAL_SECONDS + graceSeconds(DEFAULT_HEARTBEAT_INTERVAL_SECONDS);
  const heard = lastContacts.filter((date): date is Date => date !== null);
  if (heard.length < (options.minMachines ?? 3)) {
    return false;
  }
  const silent = heard.filter((date) => (now.getTime() - date.getTime()) / 1000 > silentAfter);
  return silent.length / heard.length >= (options.minFraction ?? 0.8);
}

/** Liveness straight from an integration record — contact = latest heartbeat / API request / webhook signal. */
export function livenessOfIntegration(
  integration: Pick<MachineIntegration, 'signals' | 'configuredAt' | 'heartbeatIntervalSeconds' | 'lastReportedStatus' | 'maintenanceUntil'> | null,
  now: Date = new Date(),
  options: { manufacturerSilent?: boolean } = {},
): MachineLiveness {
  const times = integration
    ? [integration.signals?.heartbeat, integration.signals?.api_request, integration.signals?.webhook]
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
        .map((value) => value.toMillis())
    : [];
  return deriveMachineLiveness({
    lastContactAt: times.length > 0 ? new Date(Math.max(...times)) : null,
    configuredAt: integration?.configuredAt?.toDate() ?? null,
    expectedIntervalSeconds: integration?.heartbeatIntervalSeconds,
    reportedOnline: integration?.lastReportedStatus?.online ?? null,
    maintenanceUntil: integration?.maintenanceUntil?.toDate() ?? null,
    manufacturerSilent: options.manufacturerSilent,
    now,
  });
}

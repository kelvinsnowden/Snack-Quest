import { deriveMachineLiveness, type MachineLiveness, type MachineLivenessReason } from '@/lib/vending/machineLiveness';
import type { Machine, MachineConnectivityStatus, MachineIntegration } from '@/types';

/**
 * How often a machine on direct device telemetry (no integration record)
 * is expected to report. Chosen so its states land close to the old
 * 5 / 15-minute online / offline thresholds: online within 6 minutes,
 * degraded to 14, offline after.
 */
export const TELEMETRY_HEARTBEAT_INTERVAL_SECONDS = 240;

/**
 * The one answer to "is this machine up?" for every page, alert and
 * count. A machine connected through the integration layer uses its
 * integration's heartbeat interval, its own "I'm offline" report and
 * staff maintenance; one on direct telemetry uses the same rules with
 * the telemetry interval. Contact is the latest of every signal Snack
 * Quest has received (integration signals and `lastSeenAt`), always
 * timed by Snack Quest's clock.
 */
export function machineLiveness(
  machine: Pick<Machine, 'lastSeenAt'>,
  integration: Pick<MachineIntegration, 'signals' | 'configuredAt' | 'heartbeatIntervalSeconds' | 'lastReportedStatus' | 'maintenanceUntil'> | null,
  now: Date = new Date(),
  options: { manufacturerSilent?: boolean } = {},
): MachineLiveness {
  const contacts = [machine.lastSeenAt, integration?.signals?.heartbeat, integration?.signals?.api_request, integration?.signals?.webhook]
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .map((value) => value.toMillis());
  return deriveMachineLiveness({
    lastContactAt: contacts.length > 0 ? new Date(Math.max(...contacts)) : null,
    configuredAt: integration?.configuredAt?.toDate() ?? null,
    expectedIntervalSeconds: integration ? integration.heartbeatIntervalSeconds : TELEMETRY_HEARTBEAT_INTERVAL_SECONDS,
    reportedOnline: integration?.lastReportedStatus?.online ?? null,
    maintenanceUntil: integration?.maintenanceUntil?.toDate() ?? null,
    manufacturerSilent: options.manufacturerSilent,
    now,
  });
}

/** The four display states the fleet, machine and owner pages already badge, from liveness. */
export function connectivityOf(liveness: MachineLiveness): MachineConnectivityStatus {
  switch (liveness.state) {
    case 'ONLINE':
      return 'online';
    case 'DEGRADED':
      return 'stale';
    case 'OFFLINE':
      return 'offline';
    default:
      return 'unknown';
  }
}

/** Why, in words a person reads — shown next to the badge. */
export const LIVENESS_REASON_LABEL: Record<MachineLivenessReason, string> = {
  responding: 'Responding',
  missed_heartbeats: 'Missed its last check-ins',
  silent: 'Not heard from',
  reports_offline: 'Says it is offline',
  maintenance: 'In maintenance',
  never_heard: 'Not heard from yet',
  manufacturer_outage_suspected: 'Its manufacturer’s whole fleet went quiet',
};

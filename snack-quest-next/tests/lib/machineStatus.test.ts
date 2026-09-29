import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { machineLiveness, connectivityOf, TELEMETRY_HEARTBEAT_INTERVAL_SECONDS } from '@/lib/vending/machineStatus';
import type { Machine, MachineIntegration } from '@/types';

const NOW = new Date('2026-09-29T10:00:00Z');
const ago = (seconds: number) => Timestamp.fromDate(new Date(NOW.getTime() - seconds * 1000)) as unknown as Machine['lastSeenAt'];
const machine = (seconds: number | null) => ({ lastSeenAt: seconds === null ? null : ago(seconds) });
type IntegrationBits = Pick<MachineIntegration, 'signals' | 'configuredAt' | 'heartbeatIntervalSeconds' | 'lastReportedStatus' | 'maintenanceUntil'>;
const integration = (overrides: Partial<IntegrationBits> = {}): IntegrationBits =>
  ({ signals: { heartbeat: ago(20), api_request: null, webhook: null }, configuredAt: null, heartbeatIntervalSeconds: 60, lastReportedStatus: null, maintenanceUntil: null, ...overrides }) as unknown as IntegrationBits;

describe('machineLiveness', () => {
  it('reads a telemetry-only machine close to the old 5 / 15 minute thresholds', () => {
    expect(TELEMETRY_HEARTBEAT_INTERVAL_SECONDS).toBe(240);
    expect(connectivityOf(machineLiveness(machine(4 * 60), null, NOW))).toBe('online');
    expect(connectivityOf(machineLiveness(machine(10 * 60), null, NOW))).toBe('stale');
    expect(connectivityOf(machineLiveness(machine(30 * 60), null, NOW))).toBe('offline');
    expect(machineLiveness(machine(null), null, NOW)).toMatchObject({ state: 'UNKNOWN', reason: 'never_heard' });
  });

  it('uses the integration: its interval, its own offline report, and maintenance', () => {
    expect(machineLiveness(machine(null), integration(), NOW)).toMatchObject({ state: 'ONLINE', reason: 'responding' });
    // Heard from recently, but the machine says it is offline: offline, whatever lastSeenAt says.
    expect(machineLiveness(machine(5), integration({ lastReportedStatus: { online: false } as unknown as IntegrationBits['lastReportedStatus'] }), NOW)).toMatchObject({ state: 'OFFLINE', reason: 'reports_offline' });
    const maintenance = machineLiveness(machine(5), integration({ maintenanceUntil: Timestamp.fromDate(new Date(NOW.getTime() + 3600_000)) as unknown as IntegrationBits['maintenanceUntil'] }), NOW);
    expect(maintenance).toMatchObject({ state: 'OFFLINE', reason: 'maintenance', planned: true });
    // A 60-second integration that has been quiet 10 minutes is offline, not merely "stale".
    expect(connectivityOf(machineLiveness(machine(600), integration({ signals: { heartbeat: ago(600), api_request: null, webhook: null } as unknown as IntegrationBits['signals'] }), NOW))).toBe('offline');
  });

  it('counts the newest contact from any signal', () => {
    const quietIntegration = integration({ signals: { heartbeat: ago(3600), api_request: null, webhook: null } as unknown as IntegrationBits['signals'] });
    expect(machineLiveness(machine(10), quietIntegration, NOW).state).toBe('ONLINE');
  });
});

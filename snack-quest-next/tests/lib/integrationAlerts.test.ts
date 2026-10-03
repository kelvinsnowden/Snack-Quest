import { describe, expect, it } from 'vitest';
import {
  abnormalTimeoutRates,
  authenticationFailures,
  expiringCredentials,
  failingWebhooks,
  repeatedDispenseFailures,
  unavailableManufacturerApis,
  type CommandFact,
  type IntegrationFact,
} from '@/lib/vending/integrationAlerts';

const NOW = Date.UTC(2026, 8, 28, 12);
const MIN = 60_000;
const cmd = (machineId: string, status: string, minutesAgo: number, manufacturerId: string | null = 'mf-1'): CommandFact => ({ machineId, manufacturerId, status, updatedAtMs: NOW - minutesAgo * MIN });

describe('repeated dispense failures', () => {
  it('three failed/unresolved dispenses on one machine within an hour; older ones and successes do not count', () => {
    const commands = [cmd('m1', 'failed', 5), cmd('m1', 'timeout', 20), cmd('m1', 'unknown', 50), cmd('m1', 'failed', 90), cmd('m2', 'failed', 5), cmd('m2', 'dispensed', 6), cmd('m2', 'failed', 7)];
    expect([...repeatedDispenseFailures(commands, NOW)]).toEqual([['m1', 3]]);
  });
});

describe('abnormal timeout rate', () => {
  it('needs volume, and fires at 20% unresolved', () => {
    const quiet = [cmd('m1', 'timeout', 1), cmd('m1', 'dispensed', 1)];
    expect(abnormalTimeoutRates(quiet, NOW).size).toBe(0);
    const busy = [...Array.from({ length: 8 }, () => cmd('m1', 'dispensed', 30)), cmd('m1', 'timeout', 30), cmd('m1', 'unknown', 30)];
    expect(abnormalTimeoutRates(busy, NOW).get('mf-1')).toEqual({ total: 10, unresolved: 2, rate: 0.2 });
    const healthy = [...Array.from({ length: 9 }, () => cmd('m1', 'dispensed', 30)), cmd('m1', 'timeout', 30)];
    expect(abnormalTimeoutRates(healthy, NOW).size).toBe(0);
  });
});

const integration = (over: Partial<IntegrationFact>): IntegrationFact => ({ machineId: 'm', manufacturerId: 'mf-1', active: true, outbound: true, lastError: null, lastSuccessMs: NOW - 60 * MIN, ...over });

describe('manufacturer API unavailable', () => {
  it('half or more of the active outbound machines failing to connect, nothing succeeding since', () => {
    const facts = [
      integration({ machineId: 'a', lastError: { kind: 'connection', atMs: NOW - 2 * MIN, message: 'ECONNREFUSED' } }),
      integration({ machineId: 'b', lastError: { kind: 'timeout', atMs: NOW - 3 * MIN, message: 'timed out' } }),
      integration({ machineId: 'c' }),
    ];
    expect(unavailableManufacturerApis(facts, NOW).get('mf-1')).toMatchObject({ failing: 2, active: 3 });
  });

  it('a success after the error, an old error, or an inbound machine does not count', () => {
    expect(unavailableManufacturerApis([integration({ lastError: { kind: 'connection', atMs: NOW - 2 * MIN, message: 'x' }, lastSuccessMs: NOW - MIN })], NOW).size).toBe(0);
    expect(unavailableManufacturerApis([integration({ lastError: { kind: 'connection', atMs: NOW - 30 * MIN, message: 'x' } })], NOW).size).toBe(0);
    expect(unavailableManufacturerApis([integration({ outbound: false, lastError: { kind: 'connection', atMs: NOW - MIN, message: 'x' } })], NOW).size).toBe(0);
  });
});

describe('authentication failures', () => {
  it('recent, unrecovered authentication errors on active machines', () => {
    const facts = [integration({ outbound: false, lastError: { kind: 'authentication', atMs: NOW - MIN, message: 'key_revoked: key sqk_x' } }), integration({ machineId: 'n', lastError: { kind: 'authentication', atMs: NOW - MIN, message: 'x' }, lastSuccessMs: NOW })];
    expect(authenticationFailures(facts, NOW).get('mf-1')).toEqual({ machines: 1, lastError: 'key_revoked: key sqk_x' });
  });
});

describe('credential expiry', () => {
  const base = { keyId: 'k', manufacturerId: 'mf-1', revokedAtMs: null, expiresAtMs: null, graceEndsAtMs: null, supersededAtMs: null, lastUsedAtMs: NOW - MIN };
  it('warns 7 days before a hard expiry, and when a rotation grace ends while the old key is still in use', () => {
    expect(expiringCredentials([{ ...base, expiresAtMs: NOW + 3 * 24 * 60 * MIN }], NOW)).toMatchObject([{ reason: 'expires_soon' }]);
    expect(expiringCredentials([{ ...base, expiresAtMs: NOW + 30 * 24 * 60 * MIN }], NOW)).toEqual([]);
    expect(expiringCredentials([{ ...base, supersededAtMs: NOW - 5 * 24 * 60 * MIN, graceEndsAtMs: NOW + 24 * 60 * MIN }], NOW)).toMatchObject([{ reason: 'rotation_grace_ending' }]);
    expect(expiringCredentials([{ ...base, supersededAtMs: NOW - 5 * 24 * 60 * MIN, graceEndsAtMs: NOW + 24 * 60 * MIN, lastUsedAtMs: NOW - 3 * 24 * 60 * MIN }], NOW)).toEqual([]);
    expect(expiringCredentials([{ ...base, revokedAtMs: NOW - MIN, expiresAtMs: NOW + MIN }], NOW)).toEqual([]);
    // A rotated-out key whose grace end is also stored as its expiry is a rotation case, not a hard expiry.
    expect(expiringCredentials([{ ...base, supersededAtMs: NOW - MIN, graceEndsAtMs: NOW + 24 * 60 * MIN, expiresAtMs: NOW + 24 * 60 * MIN }], NOW)).toMatchObject([{ reason: 'rotation_grace_ending' }]);
  });
});

describe('webhook failures', () => {
  it('a recent refusal with nothing accepted since', () => {
    expect(failingWebhooks([{ manufacturerId: 'mf-1', lastRejectedAtMs: NOW - MIN, lastRejectedCode: 'unrecognised_payload', lastAcceptedAtMs: NOW - 10 * MIN }], NOW).get('mf-1')).toEqual({ code: 'unrecognised_payload', atMs: NOW - MIN });
    expect(failingWebhooks([{ manufacturerId: 'mf-1', lastRejectedAtMs: NOW - 2 * MIN, lastRejectedCode: 'x', lastAcceptedAtMs: NOW - MIN }], NOW).size).toBe(0);
    expect(failingWebhooks([{ manufacturerId: 'mf-1', lastRejectedAtMs: NOW - 60 * MIN, lastRejectedCode: 'x', lastAcceptedAtMs: null }], NOW).size).toBe(0);
  });
});

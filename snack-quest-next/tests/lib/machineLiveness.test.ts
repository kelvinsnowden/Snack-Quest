import { describe, expect, it } from 'vitest';
import { deriveMachineLiveness, detectManufacturerSilence, ORDER_FRESHNESS_SECONDS } from '@/lib/vending/machineLiveness';

const now = new Date('2026-09-27T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const configuredAt = ago(3600);

describe('machine liveness', () => {
  it('never heard since configuration is UNKNOWN, not OFFLINE', () => {
    expect(deriveMachineLiveness({ lastContactAt: null, configuredAt, now })).toMatchObject({ state: 'UNKNOWN', reason: 'never_heard', canAcceptOrders: false });
    // Contact before a reconfiguration doesn't count either.
    expect(deriveMachineLiveness({ lastContactAt: ago(4000), configuredAt, now }).reason).toBe('never_heard');
  });

  it('ONLINE within one interval plus grace; DEGRADED after missed heartbeats; OFFLINE after sustained silence', () => {
    // E = 60 s, G = 30 s → ONLINE ≤ 90 s, DEGRADED ≤ 210 s, then OFFLINE.
    expect(deriveMachineLiveness({ lastContactAt: ago(89), configuredAt, now }).state).toBe('ONLINE');
    expect(deriveMachineLiveness({ lastContactAt: ago(91), configuredAt, now }).state).toBe('DEGRADED');
    expect(deriveMachineLiveness({ lastContactAt: ago(209), configuredAt, now }).state).toBe('DEGRADED');
    expect(deriveMachineLiveness({ lastContactAt: ago(211), configuredAt, now })).toMatchObject({ state: 'OFFLINE', reason: 'silent' });
  });

  it('scales with the machine\'s own heartbeat interval', () => {
    expect(deriveMachineLiveness({ lastContactAt: ago(400), configuredAt, expectedIntervalSeconds: 300, now }).state).toBe('ONLINE');
    expect(deriveMachineLiveness({ lastContactAt: ago(1000), configuredAt, expectedIntervalSeconds: 300, now }).state).toBe('DEGRADED');
  });

  it('a machine that says it is offline is OFFLINE even while talking to us', () => {
    expect(deriveMachineLiveness({ lastContactAt: ago(5), configuredAt, reportedOnline: false, now })).toMatchObject({ state: 'OFFLINE', reason: 'reports_offline', canAcceptOrders: false });
  });

  it('maintenance is planned OFFLINE and blocks orders', () => {
    const result = deriveMachineLiveness({ lastContactAt: ago(5), configuredAt, maintenanceUntil: new Date(now.getTime() + 60_000), now });
    expect(result).toMatchObject({ state: 'OFFLINE', reason: 'maintenance', planned: true, canAcceptOrders: false });
  });

  it('a manufacturer-wide silence reads UNKNOWN for the machine, not OFFLINE', () => {
    expect(deriveMachineLiveness({ lastContactAt: ago(600), configuredAt, manufacturerSilent: true, now })).toMatchObject({ state: 'UNKNOWN', reason: 'manufacturer_outage_suspected' });
  });

  it('only a recently-heard ONLINE machine may take orders', () => {
    expect(deriveMachineLiveness({ lastContactAt: ago(ORDER_FRESHNESS_SECONDS - 1), configuredAt, now }).canAcceptOrders).toBe(true);
    expect(deriveMachineLiveness({ lastContactAt: ago(ORDER_FRESHNESS_SECONDS + 1), configuredAt, now }).canAcceptOrders).toBe(false);
  });

  it('detects a fleet-wide silence and ignores one quiet machine', () => {
    expect(detectManufacturerSilence([ago(900), ago(950), ago(1000), ago(980)], { now })).toBe(true);
    expect(detectManufacturerSilence([ago(10), ago(20), ago(1000), ago(15)], { now })).toBe(false);
    expect(detectManufacturerSilence([ago(900), ago(950)], { now })).toBe(false);
  });
});

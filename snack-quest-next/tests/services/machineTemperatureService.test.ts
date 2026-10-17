import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { temperatureRecord } from '@/services/machineTemperatureService';

const BUSINESS_ID = 'biz-temperature-record';
const MACHINE = 'machine-temp-1';
const H = Date.parse('2026-10-17T09:00:00Z');
const MIN = 60_000;
const status = (celsius: number | null) => ({ online: true, doorOpen: false, temperatureCelsius: celsius, faults: [], paymentDeviceOk: null });

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('machineTemperatureLog'));
  await adminFirestore.collection('machineIntegrations').doc(MACHINE).set({ businessId: BUSINESS_ID, machineId: MACHINE, lastReportedStatus: null });
});

describe('the temperature record', () => {
  it('stores each finished hour from status reports and includes the hour in progress', async () => {
    await machineIntegrationRepository.setLastReportedStatus(MACHINE, status(4), new Date(H + 5 * MIN));
    await machineIntegrationRepository.setLastReportedStatus(MACHINE, status(8), new Date(H + 20 * MIN));
    await machineIntegrationRepository.setLastReportedStatus(MACHINE, status(-50), new Date(H + 30 * MIN));
    await machineIntegrationRepository.setLastReportedStatus(MACHINE, status(6), new Date(H + 65 * MIN));

    const stored = await adminFirestore.collection('machineTemperatureLog').doc(`${MACHINE}_2026101709`).get();
    expect(stored.data()).toMatchObject({ businessId: BUSINESS_ID, machineId: MACHINE, minCelsius: 4, maxCelsius: 8, avgCelsius: 6, samples: 2 });

    const rows = await temperatureRecord(BUSINESS_ID, MACHINE, H - 60 * MIN, H + 2 * 60 * MIN);
    expect(rows.map((row) => [row.hourStartMs, row.avgCelsius])).toEqual([
      [H, 6],
      [H + 60 * MIN, 6],
    ]);
    // Another business never sees these rows.
    expect(await temperatureRecord('another-business', MACHINE, H - 60 * MIN, H + 2 * 60 * MIN)).toEqual([]);
  });
});

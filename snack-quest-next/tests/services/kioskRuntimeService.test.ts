import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { KioskReportValidationError, SERVICE_MAX_FAILURES, ServiceCodeError, kioskRuntimeService } from '@/services/kioskRuntimeService';

/** Service codes and the screen's reports (§ KIOSK SERVICE MODE, § KIOSK OBSERVABILITY, § KIOSK ANALYTICS). */

const BUSINESS_ID = 'biz-kiosk-runtime';
const OTHER = 'biz-kiosk-runtime-other';

beforeEach(async () => {
  for (const businessId of [BUSINESS_ID, OTHER]) {
    for (const collection of ['machines', 'machineServiceCodes', 'machineServiceAttempts', 'kioskReportBatches', 'kioskDailyStats', 'kioskDeviceStates', 'deviceCredentials']) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
  }
});

async function machine(businessId = BUSINESS_ID) {
  const { machineId } = await machineService.provisionDevice({ businessId, machineCode: `SQ-RT-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: null, actor: 'staff-1' });
  return machineId;
}

describe('service codes', () => {
  it('a code works once, on its own machine, and is never stored in the clear', async () => {
    const machineId = await machine();
    const other = await machine();
    const { code, id } = await kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, 'Replacing the coin mech', 'tech-lead');
    expect(code).toMatch(/^\d{8}$/);
    const stored = (await adminFirestore.collection('machineServiceCodes').doc(id).get()).data()!;
    expect(JSON.stringify(stored)).not.toContain(code);

    await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, other, code)).rejects.toBeInstanceOf(ServiceCodeError);
    const session = await kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, code);
    expect(session.issuedBy).toBe('tech-lead');
    expect(session.sessionExpiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, code)).rejects.toThrow(/used|expired|isn’t right/);
  });

  it('expires after 15 minutes', async () => {
    const machineId = await machine();
    const { code } = await kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, 'Screen check', 'tech-lead');
    await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, code, new Date(Date.now() + 16 * 60_000))).rejects.toBeInstanceOf(ServiceCodeError);
  });

  it('a new code replaces the previous one', async () => {
    const machineId = await machine();
    const first = await kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, 'one', 'tech-lead');
    const second = await kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, 'two', 'tech-lead');
    if (first.code !== second.code) await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, first.code)).rejects.toBeInstanceOf(ServiceCodeError);
    await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, second.code)).resolves.toBeTruthy();
  });

  it('five wrong codes lock the screen out, even for the right code, until the window passes', async () => {
    const machineId = await machine();
    const { code } = await kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, 'Door sensor', 'tech-lead');
    const wrong = code === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < SERVICE_MAX_FAILURES; i += 1) await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, wrong)).rejects.toMatchObject({ reason: 'invalid' });
    await expect(kioskRuntimeService.redeemServiceCode(BUSINESS_ID, machineId, code)).rejects.toMatchObject({ reason: 'locked' });
  });

  it('needs a reason, and refuses another business’s machine', async () => {
    const machineId = await machine();
    const theirs = await machine(OTHER);
    await expect(kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, '  ', 'tech-lead')).rejects.toBeInstanceOf(KioskReportValidationError);
    await expect(kioskRuntimeService.issueServiceCode(BUSINESS_ID, theirs, 'x', 'tech-lead')).rejects.toThrow(/not found/);
  });

  it('lists codes without their hashes', async () => {
    const machineId = await machine();
    await kioskRuntimeService.issueServiceCode(BUSINESS_ID, machineId, 'Check', 'tech-lead');
    const [listed] = await kioskRuntimeService.listServiceCodes(BUSINESS_ID, machineId);
    expect(listed.data).not.toHaveProperty('codeHash');
    expect(listed.data).not.toHaveProperty('salt');
  });
});

describe('screen reports', () => {
  it('counts once per batch, adds up by day, and keeps what the screen last said', async () => {
    const machineId = await machine();
    const report = { batchId: 'report-0001', packageVersion: 'p123', catalogVersion: 'c9', runtimeState: 'IDLE', pendingAdEvents: 3, cachedCreatives: 2, counts: { session_started: 4, added_to_cart: 3, payment_requested: 2, bogus_metric: 99 } };
    expect(await kioskRuntimeService.recordReport(BUSINESS_ID, machineId, report)).toEqual({ duplicate: false });
    expect(await kioskRuntimeService.recordReport(BUSINESS_ID, machineId, report)).toEqual({ duplicate: true });
    await kioskRuntimeService.recordReport(BUSINESS_ID, machineId, { ...report, batchId: 'report-0002', counts: { session_started: 1 } });
    const activity = await kioskRuntimeService.activity(BUSINESS_ID, machineId);
    expect(activity.totals).toEqual({ session_started: 5, added_to_cart: 3, payment_requested: 2 });
    expect(activity.device).toMatchObject({ packageVersion: 'p123', runtimeState: 'IDLE', pendingAdEvents: 3, cachedCreatives: 2 });
  });

  it('refuses a report without a batch id or with nonsense counts', async () => {
    const machineId = await machine();
    await expect(kioskRuntimeService.recordReport(BUSINESS_ID, machineId, { counts: {} })).rejects.toBeInstanceOf(KioskReportValidationError);
    await expect(kioskRuntimeService.recordReport(BUSINESS_ID, machineId, { batchId: 'report-0003', counts: { session_started: -1 } })).rejects.toBeInstanceOf(KioskReportValidationError);
  });
});

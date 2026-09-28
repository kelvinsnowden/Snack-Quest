import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { alertService } from '@/services/alertService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineService } from '@/services/machineService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { alertRepository } from '@/repositories/alertRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import type { AlertType } from '@/types';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, webhook, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The integration alerts, end to end: each is raised from facts the
 * system really records (never from a synthetic score), once per
 * subject, and clears itself when the condition does.
 */

const BUSINESS_ID = 'biz-integration-alerts';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '2'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let ids: { manufacturerId: string; modelId: string };
let machine: V1Machine;
let key: Key;
const ago = (ms: number) => Timestamp.fromMillis(Date.now() - ms);

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  await adminFirestore.collection('alertEvaluationRuns').doc(BUSINESS_ID).delete();
  ids = await onboardManufacturer(BUSINESS_ID, 'alertco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

async function open(type: AlertType) {
  await alertService.evaluateAndSync(BUSINESS_ID);
  return (await alertService.listOpen(BUSINESS_ID, { type })).map(({ data }) => data);
}

describe('integration alerts', () => {
  it('repeated dispense failures on one machine → one critical alert, cleared when they age out', async () => {
    for (let i = 0; i < 3; i += 1) {
      await adminFirestore.collection('machineDispenseCommands').doc(`dsp_alert_${i}`).set({ businessId: BUSINESS_ID, machineId: machine.machineId, transactionId: `t${i}`, commandRef: `DSP-A${i}`, status: i === 2 ? 'unknown' : 'failed', updatedAt: ago(10 * 60_000), createdAt: ago(11 * 60_000) });
    }
    const alerts = await open('dispense_failures');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: 'critical', machineId: machine.machineId });
    for (let i = 0; i < 3; i += 1) await adminFirestore.collection('machineDispenseCommands').doc(`dsp_alert_${i}`).update({ updatedAt: ago(2 * 3600_000) });
    expect(await open('dispense_failures')).toHaveLength(0);
  });

  it('a revoked key still in use → integration authentication alert naming the reason', async () => {
    await integrationCredentialService.revoke(BUSINESS_ID, key.keyId, 'leaked', 'staff-1');
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: `hb-r-${Date.now()}` })).error?.code).toBe('key_revoked');
    const [alert] = await open('integration_auth_failures');
    expect(alert.severity).toBe('critical');
    expect(alert.detail).toContain('key_revoked');
  });

  it('a key expiring within 7 days → warning; a rotation grace ending while the old key is used → warning', async () => {
    await integrationCredentialService.issue(BUSINESS_ID, ids.manufacturerId, { kind: 'api', environment: 'sandbox', label: 'short', expiresAt: new Date(Date.now() + 3 * 86400_000) }, 'staff-1');
    await integrationCredentialService.rotate(BUSINESS_ID, key.keyId, { graceHours: 24 }, 'staff-1');
    await adminFirestore.collection('integrationCredentials').doc(key.keyId).update({ lastUsedAt: Timestamp.now() });
    const alerts = await open('credential_expiring');
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.detail)).toEqual(expect.arrayContaining([expect.stringContaining('Issue a replacement'), expect.stringContaining('still signing with the old key')]));
  });

  it('refused webhook deliveries → warning, cleared by the next accepted one', async () => {
    const hookIds = await onboardManufacturer(BUSINESS_ID, 'hookalert');
    const hookMachine = await activeMachine(BUSINESS_ID, hookIds);
    const hook = await apiKey(BUSINESS_ID, hookIds.manufacturerId, { kind: 'webhook' });
    expect((await webhook(hook, 'hookalert', { nope: true })).status).toBe(422);
    const [alert] = await open('webhook_failures');
    expect(alert.detail).toContain('unrecognised_payload');
    expect((await webhook(hook, 'hookalert', { deliveryId: 'ok-1', events: [{ type: 'DOOR_OPENED', machineId: hookMachine.manufacturerMachineId, eventId: 'e-ok-1' }] })).status).toBe(202);
    expect(await open('webhook_failures')).toHaveLength(0);
  });

  it('an outbound manufacturer API unreachable from most machines → critical alert', async () => {
    const outIds = await onboardManufacturer(BUSINESS_ID, 'apidown');
    const a = await activeMachine(BUSINESS_ID, outIds);
    const b = await activeMachine(BUSINESS_ID, outIds);
    for (const m of [a, b]) {
      await adminFirestore.collection('machineIntegrations').doc(m.machineId).update({ lastError: { kind: 'connection', message: 'ECONNREFUSED', at: ago(60_000) }, 'signals.api_request': ago(3600_000), 'signals.heartbeat': null, 'signals.webhook': null });
    }
    const [alert] = await open('manufacturer_api_unavailable');
    expect(alert).toMatchObject({ severity: 'critical' });
    expect(alert.detail).toContain('2 of 2');
  });

  it('Snack Quest\'s own API key revoked while machines depend on it → critical alert', async () => {
    const mf = await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name: 'Outbound', slug: 'outbound-rv', integrationType: 'manufacturer_api', defaultAdapterKey: 'reference_http' }, 'staff-1');
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, mf, 'technical_review', 'staff-1');
    await manufacturerRegistryService.moveToStage(BUSINESS_ID, mf, 'credentials', 'staff-1');
    const model = await manufacturerRegistryService.createModel(BUSINESS_ID, { manufacturerId: mf, name: 'R', slug: 'r', declaredCapabilities: ['vend'] }, 'staff-1');
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: 'SN-RV', manufacturer: 'reference_http', model: 'r', actor: 'staff-1' });
    await machineIntegrationService.configure(BUSINESS_ID, { machineId, manufacturerId: mf, modelId: model, manufacturerMachineId: 'RV-1', environment: 'sandbox' }, 'staff-1');
    await manufacturerApiCredentialService.set(BUSINESS_ID, mf, 'sandbox', { baseUrl: 'https://api.outbound.example', apiKey: 'outbound-key-123' }, 'staff-1');
    await machineIntegrationRepository.setState(BUSINESS_ID, machineId, 'active', 'staff-1');
    expect(await open('credential_revoked')).toHaveLength(0);
    await manufacturerApiCredentialService.revoke(BUSINESS_ID, mf, 'sandbox', 'contract ended', 'staff-1');
    const [alert] = await open('credential_revoked');
    expect(alert.detail).toContain('1 active machine');
  });

  it('a critical condition that flaps is texted once per cooldown, not on every re-open', async () => {
    await adminFirestore.collection('businesses').doc(BUSINESS_ID).set({ orderAlertRecipients: [{ phone: '254700000009', label: 'Ops' }] }, { merge: true });
    const sent: string[] = [];
    const send = async (_b: string, input: { dedupeKey: string }) => { sent.push(input.dedupeKey); };
    const draft = { businessId: BUSINESS_ID, type: 'dispense_failures' as const, severity: 'critical' as const, machineId: machine.machineId, locationId: null, dedupeKey: 'dispense_failures:flap', title: 'flap', detail: 'flap' };
    await alertRepository.upsertOpenCondition(draft);
    await alertService.notifyCritical(BUSINESS_ID, { send: send as never });
    expect(sent).toHaveLength(1);
    await alertRepository.autoResolveMissing(BUSINESS_ID, 'dispense_failures', new Set());
    await alertRepository.upsertOpenCondition(draft);
    expect((await alertService.notifyCritical(BUSINESS_ID, { send: send as never })).notified).toBe(0);
    expect(sent).toHaveLength(1);
  });
});

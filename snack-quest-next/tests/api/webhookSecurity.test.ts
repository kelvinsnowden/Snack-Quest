import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { MAX_TIMESTAMP_SKEW_SECONDS } from '@/lib/vending/requestSigning';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, routes, signed, webhook, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Manufacturer webhooks, attacked: every way a delivery can be forged,
 * altered, replayed, duplicated or misdirected, and the one valid path
 * that moves money. A webhook is never trusted for more than its signer
 * is entitled to — its own manufacturer's machines, in its own
 * environment.
 */

const BUSINESS_ID = 'biz-webhook-security';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let rivalMachine: V1Machine;
let hook: Key;
let rivalHook: Key;
const PATH = '/api/v1/webhooks/manufacturers/hookco';
const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'hookco');
  const rivalIds = await onboardManufacturer(BUSINESS_ID, 'rivalco');
  machine = await activeMachine(BUSINESS_ID, ids);
  rivalMachine = await activeMachine(BUSINESS_ID, rivalIds);
  hook = await apiKey(BUSINESS_ID, ids.manufacturerId, { kind: 'webhook' });
  rivalHook = await apiKey(BUSINESS_ID, rivalIds.manufacturerId, { kind: 'webhook' });
});

async function paidSale(machineId: string) {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `R${id.slice(0, 8)}`);
  const { vendRef } = await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  if (!vendRef) throw new Error('no vend reference');
  return { id, vendRef };
}
const success = (deliveryId: string, manufacturerMachineId: string, vendRef: string) => ({
  deliveryId,
  events: [{ type: 'DISPENSE_SUCCESS', machineId: manufacturerMachineId, eventId: `${deliveryId}-e1`, data: { vendRef } }],
});
const statusOf = async (id: string) => (await machineTransactionRepository.findById(BUSINESS_ID, id))?.status;
const codeOf = async (response: Response) => ((await response.json()) as { error?: { code: string } }).error?.code;

describe('webhook security', () => {
  it('valid: signed by the manufacturer, for its own machine → applied', async () => {
    const sale = await paidSale(machine.machineId);
    const result = await webhook(hook, 'hookco', success('d-valid', machine.manufacturerMachineId, sale.vendRef));
    expect(result.status).toBe(202);
    expect(await statusOf(sale.id)).toBe('dispensed');
  });

  it('invalid signature → 401, nothing applied', async () => {
    const sale = await paidSale(machine.machineId);
    const result = await webhook({ keyId: hook.keyId, secret: 'sqs_forged' }, 'hookco', success('d-forged', machine.manufacturerMachineId, sale.vendRef));
    expect(result).toMatchObject({ status: 401, error: { code: 'invalid_signature' } });
    expect(await statusOf(sale.id)).toBe('vend_authorized');
  });

  it('body modified after signing → 401, nothing applied', async () => {
    const sale = await paidSale(machine.machineId);
    const honest = signed(hook, PATH, { deliveryId: 'd-mod', events: [] });
    const tampered = new Request(honest.url, { method: 'POST', headers: honest.headers, body: JSON.stringify(success('d-mod', machine.manufacturerMachineId, sale.vendRef)) });
    const response = await routes.webhookRoute(tampered, slug('hookco'));
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe('invalid_signature');
    expect(await statusOf(sale.id)).toBe('vend_authorized');
  });

  it('expired timestamp → 401 stale_timestamp with the server time, nothing applied', async () => {
    const sale = await paidSale(machine.machineId);
    const old = Math.floor(Date.now() / 1000) - MAX_TIMESTAMP_SKEW_SECONDS - 60;
    const response = await routes.webhookRoute(signed(hook, PATH, success('d-old', machine.manufacturerMachineId, sale.vendRef), { timestamp: old }), slug('hookco'));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; details?: { serverTimestamp?: number } } };
    expect(body.error.code).toBe('stale_timestamp');
    expect(await statusOf(sale.id)).toBe('vend_authorized');
  });

  it('replay of a captured delivery (same nonce) → 401 replayed_request', async () => {
    const sale = await paidSale(machine.machineId);
    const body = success('d-replay', machine.manufacturerMachineId, sale.vendRef);
    const nonce = `replay-${Date.now()}-nonce`;
    const timestamp = Math.floor(Date.now() / 1000);
    expect((await routes.webhookRoute(signed(hook, PATH, body, { nonce, timestamp }), slug('hookco'))).status).toBe(202);
    const replay = await routes.webhookRoute(signed(hook, PATH, body, { nonce, timestamp }), slug('hookco'));
    expect(replay.status).toBe(401);
    expect(await codeOf(replay)).toBe('replayed_request');
  });

  it('duplicate delivery (re-signed, same deliveryId/eventIds) → accepted as a duplicate, applied once', async () => {
    const sale = await paidSale(machine.machineId);
    const body = success('d-dup', machine.manufacturerMachineId, sale.vendRef);
    const first = await webhook(hook, 'hookco', body);
    const again = await webhook(hook, 'hookco', body);
    expect(first.data).toMatchObject({ dispenseOutcomesApplied: 1 });
    expect(again.status).toBe(200);
    expect((again.data as { dispenseOutcomesApplied?: number }).dispenseOutcomesApplied ?? 0).toBe(0);
    const movements = await adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', sale.id).where('reason', '==', 'sale').get();
    expect(movements.size).toBe(1);
  });

  it('unknown event type → kept as UNKNOWN_EVENT for review, never acted on', async () => {
    const result = await webhook(hook, 'hookco', { deliveryId: 'd-unknown', events: [{ type: 'COFFEE_BREWED', machineId: machine.manufacturerMachineId, eventId: 'u-1' }] });
    expect(result.status).toBe(202);
    const events = await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', '==', 'UNKNOWN_EVENT').get();
    expect(events.size).toBe(1);
  });

  it('malformed payload (valid signature) → 422, and bytes that are not JSON → 400', async () => {
    const malformed = await webhook(hook, 'hookco', { nope: true });
    expect(malformed.status).toBe(422);
    const notJson = await routes.webhookRoute(signed(hook, PATH, undefined, { method: 'POST', rawBody: '{not json' }), slug('hookco'));
    expect(notJson.status).toBe(400);
    expect(await codeOf(notJson)).toBe('invalid_json');
  });

  it('cross-manufacturer: a rival\'s key cannot post to this manufacturer\'s webhook URL', async () => {
    const response = await routes.webhookRoute(signed(rivalHook, PATH, { deliveryId: 'x', events: [] }), slug('hookco'));
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe('manufacturer_not_found');
  });

  it('cross-manufacturer: a manufacturer cannot move another manufacturer\'s sale through its own URL', async () => {
    const rivalSale = await paidSale(rivalMachine.machineId);
    // hookco signs, on its own URL, a report naming the rival's machine and vend.
    const result = await webhook(hook, 'hookco', success('d-cross', rivalMachine.manufacturerMachineId, rivalSale.vendRef));
    expect((result.data as { unmatchedMachines?: string[] }).unmatchedMachines).toEqual([rivalMachine.manufacturerMachineId]);
    expect(await statusOf(rivalSale.id)).toBe('vend_authorized');
  });

  it('an API key is not a webhook key', async () => {
    const api = await apiKey(BUSINESS_ID, (await adminFirestore.collection('manufacturers').where('slug', '==', 'hookco').get()).docs[0].id);
    const response = await routes.webhookRoute(signed(api, PATH, { deliveryId: 'k', events: [] }), slug('hookco'));
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe('wrong_key_kind');
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { signRequest } from '@/lib/vending/requestSigning';
import { buildDeviceAuthHeader } from '@/lib/vending/deviceAuth';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineCommandService } from '@/services/machineCommandService';
import { MachineSlotService } from '@/services/machineSlotService';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineEventRepository } from '@/repositories/machineEventRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { POST as connect } from '@/app/api/v1/machines/connect/route';
import { GET as describeMachine } from '@/app/api/v1/machines/[machineCode]/route';
import { POST as heartbeat } from '@/app/api/v1/machines/[machineCode]/heartbeat/route';
import { POST as status } from '@/app/api/v1/machines/[machineCode]/status/route';
import { POST as inventory } from '@/app/api/v1/machines/[machineCode]/inventory/route';
import { POST as events } from '@/app/api/v1/machines/[machineCode]/events/route';
import { GET as listCommands } from '@/app/api/v1/machines/[machineCode]/commands/route';
import { POST as ackCommand } from '@/app/api/v1/machines/[machineCode]/commands/[commandId]/ack/route';
import { POST as commandStatus } from '@/app/api/v1/machines/[machineCode]/commands/[commandId]/status/route';
import { POST as webhook } from '@/app/api/v1/webhooks/manufacturers/[slug]/route';
import { clearIntegrationCollections, provisionMachine } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-machine-api-v1-test';
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;
const ORIGINAL_ENCRYPTION_KEY = process.env.SECRET_ENCRYPTION_KEY;

// The v1 routes resolve adapters through the real registry, so tests
// drive the registry's own shared mock machine.
const mock = defaultVendingAdapterResolver('mock') as MockVendingAdapter;

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'a'.repeat(64);
});

afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
  if (ORIGINAL_ENCRYPTION_KEY === undefined) {
    delete process.env.SECRET_ENCRYPTION_KEY;
  } else {
    process.env.SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  }
});

interface Setup {
  manufacturerId: string;
  modelId: string;
  machineId: string;
  machineCode: string;
  deviceSecret: string;
  api: { keyId: string; secret: string };
  webhookKey: { keyId: string; secret: string };
}

let setup: Setup;

async function onboardManufacturer(slug: string) {
  const manufacturerId = await manufacturerRegistryService.createManufacturer(
    BUSINESS_ID,
    { name: slug, slug, integrationType: 'hybrid', defaultAdapterKey: 'mock' },
    'staff-1',
  );
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'credentials', 'staff-1');
  const modelId = await manufacturerRegistryService.createModel(
    BUSINESS_ID,
    { manufacturerId, name: 'M1', slug: 'm1', declaredCapabilities: ['vend', 'inventory_read', 'heartbeat', 'telemetry', 'faults'] },
    'staff-1',
  );
  return { manufacturerId, modelId };
}

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  const { manufacturerId, modelId } = await onboardManufacturer('acme');
  const { machineId, machineCode, secret } = await provisionMachine(BUSINESS_ID);
  mock.seedSlot(machineId, 'A01', { quantity: 5 });
  const slots = new MachineSlotService(() => mock);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 250, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
  await slots.setSlotMappings(BUSINESS_ID, machineId, [{ slotCode: 'A01', manufacturerSlotId: 'spiral_01' }]);
  await machineIntegrationService.configure(BUSINESS_ID, { machineId, manufacturerId, modelId, manufacturerMachineId: 'ACME-77', environment: 'sandbox' }, 'staff-1');
  await machineIntegrationRepository.setState(BUSINESS_ID, machineId, 'active', 'staff-1');
  const api = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'sandbox', label: 'cloud' }, 'staff-1');
  const webhookKey = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'webhook', environment: 'sandbox', label: 'hooks' }, 'staff-1');
  setup = { manufacturerId, modelId, machineId, machineCode, deviceSecret: secret, api, webhookKey };
});

function signed(path: string, body: unknown, options: { method?: string; key?: { keyId: string; secret: string }; nonce?: string; timestamp?: number } = {}): Request {
  const method = options.method ?? 'POST';
  const raw = body === undefined ? '' : JSON.stringify(body);
  const key = options.key ?? setup.api;
  const headers = signRequest({ keyId: key.keyId, secret: key.secret, method, pathWithQuery: path, body: raw, nonce: options.nonce, timestamp: options.timestamp });
  return new Request(`http://localhost${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : raw });
}

const machineParams = () => ({ params: Promise.resolve({ machineCode: setup.machineCode }) });
const commandParams = (commandId: string) => ({ params: Promise.resolve({ machineCode: setup.machineCode, commandId }) });

describe('authentication', () => {
  it('refuses an unsigned request', async () => {
    const response = await heartbeat(new Request(`http://localhost/api/v1/machines/${setup.machineCode}/heartbeat`, { method: 'POST', body: '{}' }), machineParams());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('missing_signature');
  });

  it('refuses a tampered body and records the failure against the integration', async () => {
    const path = `/api/v1/machines/${setup.machineCode}/heartbeat`;
    const good = signed(path, { eventId: 'hb-1' });
    const tampered = new Request(good.url, { method: 'POST', headers: good.headers, body: JSON.stringify({ eventId: 'hb-2' }) });
    const response = await heartbeat(tampered, machineParams());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_signature');
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, setup.machineId))?.errorCounts.authentication).toBe(1);
  });

  it('refuses a replayed request (same nonce)', async () => {
    const path = `/api/v1/machines/${setup.machineCode}/heartbeat`;
    const nonce = 'replay-nonce-0123456789';
    expect((await heartbeat(signed(path, { eventId: 'hb-1' }, { nonce }), machineParams())).status).toBe(202);
    const replay = await heartbeat(signed(path, { eventId: 'hb-1' }, { nonce }), machineParams());
    expect(replay.status).toBe(401);
    expect((await replay.json()).error.code).toBe('replayed_request');
  });

  it('refuses a timestamp outside the five-minute window', async () => {
    const response = await heartbeat(signed(`/api/v1/machines/${setup.machineCode}/heartbeat`, { eventId: 'hb-1' }, { timestamp: Math.floor(Date.now() / 1000) - 600 }), machineParams());
    expect((await response.json()).error.code).toBe('stale_timestamp');
  });

  it('refuses a revoked key immediately', async () => {
    await integrationCredentialService.revoke(BUSINESS_ID, setup.api.keyId, 'rotated', 'staff-1');
    const response = await heartbeat(signed(`/api/v1/machines/${setup.machineCode}/heartbeat`, { eventId: 'hb-1' }), machineParams());
    expect((await response.json()).error.code).toBe('key_revoked');
  });

  it('refuses a webhook key on the API', async () => {
    const response = await heartbeat(signed(`/api/v1/machines/${setup.machineCode}/heartbeat`, { eventId: 'hb-1' }, { key: setup.webhookKey }), machineParams());
    expect((await response.json()).error.code).toBe('wrong_key_kind');
  });

  it('stores the secret encrypted, never in the clear', async () => {
    const stored = await integrationCredentialRepository.findByKeyId(setup.api.keyId);
    expect(stored?.secretEncrypted.startsWith('enc:v1:')).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(setup.api.secret);
  });
});

describe('isolation', () => {
  it('another manufacturer\'s valid key cannot reach this machine — and cannot tell it exists', async () => {
    const other = await onboardManufacturer('rival');
    const rivalKey = await integrationCredentialService.issue(BUSINESS_ID, other.manufacturerId, { kind: 'api', environment: 'sandbox', label: 'x' }, 'staff-1');
    const response = await heartbeat(signed(`/api/v1/machines/${setup.machineCode}/heartbeat`, { eventId: 'hb-1' }, { key: rivalKey }), machineParams());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('machine_not_found');
  });

  it('a production key cannot reach a sandbox machine', async () => {
    const productionKey = await integrationCredentialRepository.issue({ businessId: BUSINESS_ID, manufacturerId: setup.manufacturerId, kind: 'api', environment: 'production', label: 'p', issuedBy: 'staff-1', expiresAt: null });
    const response = await heartbeat(signed(`/api/v1/machines/${setup.machineCode}/heartbeat`, { eventId: 'hb-1' }, { key: productionKey }), machineParams());
    expect(response.status).toBe(404);
  });

  it('a device credential reaches only its own machine', async () => {
    const own = new Request(`http://localhost/api/v1/machines/${setup.machineCode}/heartbeat`, {
      method: 'POST',
      headers: { authorization: buildDeviceAuthHeader(setup.machineId, setup.deviceSecret) },
      body: JSON.stringify({ eventId: 'dev-hb-1' }),
    });
    expect((await heartbeat(own, machineParams())).status).toBe(202);
    const other = await provisionMachine(BUSINESS_ID);
    const foreign = new Request(`http://localhost/api/v1/machines/${other.machineCode}/heartbeat`, {
      method: 'POST',
      headers: { authorization: buildDeviceAuthHeader(setup.machineId, setup.deviceSecret) },
      body: JSON.stringify({ eventId: 'dev-hb-2' }),
    });
    expect((await heartbeat(foreign, { params: Promise.resolve({ machineCode: other.machineCode }) })).status).toBe(404);
  });
});

describe('machine registration and description', () => {
  it('connects a pre-registered unit and describes it in the manufacturer\'s own slot names', async () => {
    const response = await connect(signed('/api/v1/machines/connect', { manufacturerMachineId: 'ACME-77', firmwareVersion: '4.2.0' }));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.machineCode).toBe(setup.machineCode);
    expect(data.slots).toEqual([{ slotId: 'spiral_01', priceKes: 250, enabled: true, capacity: 10 }]);
    expect(data.capabilities).toContain('vend');
    expect(JSON.stringify(data)).not.toContain(setup.machineId);
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, setup.machineId))?.firmwareVersion).toBe('4.2.0');
  });

  it('never creates a machine for an unknown manufacturer machine id', async () => {
    const response = await connect(signed('/api/v1/machines/connect', { manufacturerMachineId: 'ACME-NOPE' }));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('machine_not_provisioned');
  });

  it('GET describes the machine', async () => {
    const response = await describeMachine(signed(`/api/v1/machines/${setup.machineCode}`, undefined, { method: 'GET' }), machineParams());
    expect((await response.json()).data.integrationState).toBe('active');
  });
});

describe('reporting', () => {
  it('heartbeats are idempotent per eventId and count toward integration health', async () => {
    const path = `/api/v1/machines/${setup.machineCode}/heartbeat`;
    expect((await (await heartbeat(signed(path, { eventId: 'hb-1' }), machineParams())).json()).data.accepted).toBe(true);
    expect((await (await heartbeat(signed(path, { eventId: 'hb-1' }), machineParams())).json()).data.accepted).toBe(false);
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, setup.machineId);
    expect(integration?.signals.heartbeat).not.toBeNull();
    expect(integration?.signals.api_request).not.toBeNull();
  });

  it('a status report stores the snapshot and raises one event per fault', async () => {
    await status(signed(`/api/v1/machines/${setup.machineCode}/status`, { eventId: 's-1', online: true, doorOpen: false, temperatureCelsius: 6, faults: ['E12', 'E40'], paymentDeviceOk: false }), machineParams());
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, setup.machineId);
    expect(integration?.lastReportedStatus).toMatchObject({ online: true, temperatureCelsius: 6, faults: ['E12', 'E40'], paymentDeviceOk: false });
    const types = (await machineEventRepository.listByMachine(BUSINESS_ID, setup.machineId)).map(({ data }) => data.type).sort();
    expect(types).toEqual(['MACHINE_ERROR', 'MACHINE_ERROR', 'PAYMENT_DEVICE_ERROR', 'STATUS_REPORTED']);
  });

  it('inventory mismatches come back in the manufacturer\'s slot names', async () => {
    const response = await inventory(signed(`/api/v1/machines/${setup.machineCode}/inventory`, { reportId: 'inv-1', slots: [{ slotId: 'spiral_01', quantity: 3 }, { slotId: 'spiral_99', quantity: 1 }] }), machineParams());
    const { data } = await response.json();
    expect(data.mismatches).toEqual([{ slotId: 'spiral_01', expected: 5, reported: 3 }]);
    expect(data.unmappedSlots).toEqual(['spiral_99']);
  });

  it('refuses dispense outcomes sent as generic events', async () => {
    const response = await events(signed(`/api/v1/machines/${setup.machineCode}/events`, { events: [{ eventId: 'x', type: 'DISPENSE_SUCCESS' }] }), machineParams());
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('dispense_events_not_accepted_here');
  });

  it('keeps unknown event types rather than dropping them', async () => {
    const response = await events(signed(`/api/v1/machines/${setup.machineCode}/events`, { events: [{ eventId: 'x-1', type: 'COIN_JAM', slotId: 'spiral_01' }] }), machineParams());
    expect((await response.json()).data.unknownTypes).toEqual(['COIN_JAM']);
    const [event] = (await machineEventRepository.listByMachine(BUSINESS_ID, setup.machineId)).map(({ data }) => data);
    expect(event).toMatchObject({ type: 'UNKNOWN_EVENT', nativeType: 'COIN_JAM', slotCode: 'A01' });
  });

  it('returns every schema problem as a 422', async () => {
    const response = await status(signed(`/api/v1/machines/${setup.machineCode}/status`, { eventId: 'bad id', temperatureCelsius: 999 }), machineParams());
    expect(response.status).toBe(422);
    const { error } = await response.json();
    expect(error.code).toBe('validation_failed');
    expect(error.details.map((detail: { path: string }) => detail.path).sort()).toEqual(['eventId', 'online', 'temperatureCelsius']);
  });
});

describe('dispense lifecycle over the v1 API', () => {
  async function paidAndDispatched() {
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: setup.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RCPT-9');
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
    return { transactionId: id, commandRef: command!.commandRef };
  }

  it('dispensed completes the sale once, however many times it is reported', async () => {
    const { transactionId, commandRef } = await paidAndDispatched();
    const path = `/api/v1/machines/${setup.machineCode}/commands/${commandRef}/status`;
    const first = await commandStatus(signed(path, { status: 'dispensed', eventId: 'out-1' }), commandParams(commandRef));
    expect((await first.json()).data.applied).toBe(true);
    const again = await commandStatus(signed(path, { status: 'dispensed', eventId: 'out-1' }), commandParams(commandRef));
    expect((await again.json()).data.applied).toBe(false);
    expect((await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.status).toBe('dispensed');
    const sales = (await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, setup.machineId, 'A01')).filter(({ data }) => data.reason === 'sale');
    expect(sales).toHaveLength(1);
  });

  it('failed sends the customer to the refund path with the machine\'s failure code', async () => {
    const { transactionId, commandRef } = await paidAndDispatched();
    await commandStatus(signed(`/api/v1/machines/${setup.machineCode}/commands/${commandRef}/status`, { status: 'failed', eventId: 'out-2', failureCode: 'jam', failureReason: 'spiral stuck' }), commandParams(commandRef));
    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
    expect(transaction?.status).toBe('paid_vend_failed');
    expect(transaction?.dispenseFailureStatus).toBe('jam');
  });

  it('another machine\'s command is not found', async () => {
    const { commandRef } = await paidAndDispatched();
    const response = await commandStatus(signed(`/api/v1/machines/${setup.machineCode}/commands/DSP-NOTREAL/status`, { status: 'dispensed', eventId: 'x' }), commandParams('DSP-NOTREAL'));
    expect(response.status).toBe(404);
    expect(commandRef).toMatch(/^DSP-/);
  });

  it('maintenance commands are listed, acknowledged and completed by public reference', async () => {
    mock.setOnline(setup.machineId);
    const { commandRef } = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId: setup.machineId, commandType: 'restart', requestedBy: 'staff-1' });
    const list = await (await listCommands(signed(`/api/v1/machines/${setup.machineCode}/commands`, undefined, { method: 'GET' }), machineParams())).json();
    expect(list.data.commands).toEqual([expect.objectContaining({ commandId: commandRef, type: 'restart' })]);
    expect((await (await ackCommand(signed(`/api/v1/machines/${setup.machineCode}/commands/${commandRef}/ack`, undefined), commandParams(commandRef))).json()).data.status).toBe('acknowledged');
    await commandStatus(signed(`/api/v1/machines/${setup.machineCode}/commands/${commandRef}/status`, { status: 'completed', eventId: 'c-1' }), commandParams(commandRef));
    const history = await machineCommandService.listHistoryForMachine(BUSINESS_ID, setup.machineId);
    expect(history.commands[0].data.status).toBe('completed');
  });
});

describe('manufacturer webhooks', () => {
  const hookPath = '/api/v1/webhooks/manufacturers/acme';
  const hookParams = (slug = 'acme') => ({ params: Promise.resolve({ slug }) });

  it('records a signed delivery, and treats a redelivery as a duplicate', async () => {
    const body = { deliveryId: 'd-1', events: [{ type: 'DOOR_OPENED', machineId: 'ACME-77', eventId: 'w-1' }] };
    const first = await webhook(signed(hookPath, body, { key: setup.webhookKey }), hookParams());
    expect(first.status).toBe(202);
    expect((await first.json()).data.eventsRecorded).toBe(1);
    const second = await webhook(signed(hookPath, body, { key: setup.webhookKey }), hookParams());
    expect(second.status).toBe(200);
    expect((await second.json()).data.duplicate).toBe(true);
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, setup.machineId))?.signals.webhook).not.toBeNull();
  });

  it('rejects a replayed delivery by nonce before reading it', async () => {
    const body = { deliveryId: 'd-2', events: [] };
    await webhook(signed(hookPath, body, { key: setup.webhookKey, nonce: 'webhook-nonce-000000001' }), hookParams());
    const replay = await webhook(signed(hookPath, body, { key: setup.webhookKey, nonce: 'webhook-nonce-000000001' }), hookParams());
    expect(replay.status).toBe(401);
  });

  it('one manufacturer cannot post as another', async () => {
    const other = await onboardManufacturer('rival');
    const rivalHook = await integrationCredentialService.issue(BUSINESS_ID, other.manufacturerId, { kind: 'webhook', environment: 'sandbox', label: 'x' }, 'staff-1');
    const response = await webhook(signed(hookPath, { deliveryId: 'd-3', events: [] }, { key: rivalHook }), hookParams());
    expect(response.status).toBe(404);
  });

  it('reports events for machines it cannot match instead of guessing', async () => {
    const response = await webhook(signed(hookPath, { deliveryId: 'd-4', events: [{ type: 'DOOR_OPENED', machineId: 'ACME-UNKNOWN', eventId: 'w-2' }] }, { key: setup.webhookKey }), hookParams());
    expect((await response.json()).data.unmatchedMachines).toEqual(['ACME-UNKNOWN']);
  });

  it('applies a dispense outcome delivered by webhook through the one money-moving path', async () => {
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: setup.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RCPT-10');
    const { vendRef } = await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const body = { deliveryId: 'd-5', events: [{ type: 'DISPENSE_SUCCESS', machineId: 'ACME-77', eventId: 'w-3', data: { vendRef } }] };
    const response = await webhook(signed(hookPath, body, { key: setup.webhookKey }), hookParams());
    expect((await response.json()).data.dispenseOutcomesApplied).toBe(1);
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('dispensed');
  });

  it('a malformed delivery is a 422 — retrying will not help', async () => {
    const response = await webhook(signed(hookPath, { nope: true }, { key: setup.webhookKey }), hookParams());
    expect(response.status).toBe(422);
  });
});

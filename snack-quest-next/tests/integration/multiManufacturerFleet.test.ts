import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { ReferenceHttpAdapter } from '@/lib/vending/adapters/referenceHttpAdapter';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { manufacturerApiCredentialService } from '@/services/manufacturerApiCredentialService';
import { MachineIntegrationService } from '@/services/machineIntegrationService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { MachineSlotService } from '@/services/machineSlotService';
import { ManufacturerWebhookService } from '@/services/manufacturerWebhookService';
import { partnerService } from '@/services/partnerService';
import { ownerPortalService } from '@/services/ownerPortalService';
import { PartnerDoesNotOwnMachineError, machineService } from '@/services/machineService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineEventRepository } from '@/repositories/machineEventRepository';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { V1SimulatedMachine } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';

/**
 * The deliverable scenario from the brief, end to end:
 *
 *   OWNER A ── Machine 001  Manufacturer A / Model X  (Snack Quest calls their API)
 *           └─ Machine 002  Manufacturer B / Model Y  (they call the Snack Quest API)
 *   OWNER B ── Machine 003  Manufacturer B / Model Y
 *           └─ Machine 004  Manufacturer C / Model Z  (HTTP API + webhooks)
 *
 * All four sell through the same payment path, the same dispense
 * ledger, the same event stream and the same owner portal. Nothing
 * above the adapters knows which is which.
 */

const BUSINESS_ID = 'biz-multi-manufacturer-fleet';
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;
const ORIGINAL_KEY = process.env.SECRET_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '6'.repeat(64);
});

afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
});

/** Manufacturer C's API — a fake of the reference contract that dispenses whatever it is asked to. */
function manufacturerCServer() {
  const vends = new Map<string, string>();
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const vend = url.match(/\/v1\/machines\/([^/]+)\/vends\/([^/]+)$/);
    if (vend && init.method === 'PUT') {
      vends.set(decodeURIComponent(vend[2]), 'dispensed');
      return Response.json({ accepted: true }, { status: 201 });
    }
    if (vend) {
      return Response.json({ state: vends.get(decodeURIComponent(vend[2])) ?? 'pending' });
    }
    return Response.json({ online: true, doorOpen: false, temperatureC: 5, faults: [] });
  };
  return { vends, fetchImpl };
}

let mockA: MockVendingAdapter;
let referenceC: ReferenceHttpAdapter;
let resolver: VendingAdapterResolver;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  mockA = new MockVendingAdapter();
  // Credentials resolved the production way: through the server-side credential service, per machine.
  referenceC = new ReferenceHttpAdapter({ credentialFor: (machineId) => manufacturerApiCredentialService.resolveForMachine(machineId), fetchImpl: manufacturerCServer().fetchImpl, retryDelaysMs: [0] });
  resolver = (key) => (key === 'mock' ? mockA : key === 'reference_http' ? referenceC : defaultVendingAdapterResolver(key));
});

async function onboard(name: string, slug: string, integrationType: 'manufacturer_api' | 'snack_quest_api' | 'hybrid', adapterKey: string, model: string) {
  const manufacturerId = await manufacturerRegistryService.createManufacturer(BUSINESS_ID, { name, slug, integrationType, defaultAdapterKey: adapterKey }, 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'credentials', 'staff-1');
  const modelId = await manufacturerRegistryService.createModel(
    BUSINESS_ID,
    { manufacturerId, name: model, slug: model.toLowerCase(), declaredCapabilities: ['vend', 'dispense_confirmation', 'heartbeat', 'telemetry', 'faults', 'temperature', 'door_status'] },
    'staff-1',
  );
  return { manufacturerId, modelId };
}

async function registerMachine(ownerPartnerId: string, adapterKey: string, ids: { manufacturerId: string; modelId: string }, manufacturerMachineId: string, manufacturerSlotId: string) {
  const { machineId, machineCode } = await machineService.provisionDevice({ businessId: BUSINESS_ID, serialNumber: `SN-${manufacturerMachineId}`, manufacturer: adapterKey, model: 'fleet', ownerPartnerId, actor: 'staff-1' });
  mockA.seedSlot(machineId, 'A01', { quantity: 5 });
  const slots = new MachineSlotService(resolver);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 200, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
  await slots.setSlotMappings(BUSINESS_ID, machineId, [{ slotCode: 'A01', manufacturerSlotId }]);
  const integrations = new MachineIntegrationService(resolver);
  await integrations.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId, environment: 'sandbox' }, 'staff-1');
  return { machineId, machineCode, integrations };
}

async function goLive(integrations: MachineIntegrationService, machineId: string) {
  expect((await integrations.testConnection(BUSINESS_ID, machineId, 'staff-1')).ok).toBe(true);
  await integrations.activate(BUSINESS_ID, machineId, 'staff-1');
}

describe('one Snack Quest OS over three manufacturers', () => {
  it('sells on all four machines through one payment path, and each owner sees only their own — with no hardware details', async () => {
    const ownerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner A', actor: 'staff-1' });
    const ownerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner B', actor: 'staff-1' });

    const manufacturerA = await onboard('Manufacturer A', 'maker-a', 'manufacturer_api', 'mock', 'Model-X');
    const manufacturerB = await onboard('Manufacturer B', 'maker-b', 'snack_quest_api', 'snack_quest_gateway', 'Model-Y');
    const manufacturerC = await onboard('Manufacturer C', 'maker-c', 'hybrid', 'reference_http', 'Model-Z');

    const m001 = await registerMachine(ownerA, 'mock', manufacturerA, 'A-001', 'spiral_01');
    const m002 = await registerMachine(ownerA, 'snack_quest_gateway', manufacturerB, 'B-002', 'motor-1');
    const m003 = await registerMachine(ownerB, 'snack_quest_gateway', manufacturerB, 'B-003', 'motor-1');
    const m004 = await registerMachine(ownerB, 'reference_http', manufacturerC, 'C-004', 'tray-1');
    await manufacturerApiCredentialService.set(BUSINESS_ID, manufacturerC.manufacturerId, 'sandbox', { baseUrl: 'https://c.example.test', apiKey: 'sandbox-key-for-c' }, 'staff-1');

    // Machine 001: Snack Quest calls Manufacturer A.
    mockA.setOnline(m001.machineId);
    await goLive(m001.integrations, m001.machineId);

    // Machines 002 and 003: Manufacturer B's firmware calls Snack Quest.
    const keyB = await integrationCredentialService.issue(BUSINESS_ID, manufacturerB.manufacturerId, { kind: 'api', environment: 'sandbox', label: 'fw' }, 'staff-1');
    const sim002 = new V1SimulatedMachine(new InProcessV1Transport(), keyB, 'B-002');
    const sim003 = new V1SimulatedMachine(new InProcessV1Transport(), keyB, 'B-003');
    for (const sim of [sim002, sim003]) {
      sim.load('motor-1', 5);
      await sim.connect();
      await sim.heartbeat();
    }
    await goLive(m002.integrations, m002.machineId);
    await goLive(m003.integrations, m003.machineId);

    // Machine 004: Snack Quest calls Manufacturer C, which reports outcomes by webhook.
    await goLive(m004.integrations, m004.machineId);

    // One sale per machine, through the same service.
    const transactions = new MachineTransactionService(resolver);
    const sale = async (machineId: string) => {
      const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await transactions.markPaymentVerified(BUSINESS_ID, id, `RCPT-${id.slice(0, 5)}`);
      return { id, ...(await transactions.authorizeVend(BUSINESS_ID, id)) };
    };
    const s001 = await sale(m001.machineId);
    const s002 = await sale(m002.machineId);
    const s003 = await sale(m003.machineId);
    const s004 = await sale(m004.machineId);

    // Outcomes arrive the way each manufacturer delivers them.
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId: m001.machineId, rawPayload: { vendRef: s001.vendRef, dispensed: true, idempotencyKey: 'a-1' }, source: 'test', actor: 'device' });
    await sim002.pollAndExecute();
    await sim003.pollAndExecute();
    const hookC = await integrationCredentialRepository.issue({ businessId: BUSINESS_ID, manufacturerId: manufacturerC.manufacturerId, kind: 'webhook', environment: 'sandbox', label: 'h', issuedBy: 'staff-1', expiresAt: null });
    const command004 = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, s004.id);
    await new ManufacturerWebhookService(resolver).ingest(
      BUSINESS_ID,
      (await integrationCredentialRepository.findByKeyId(hookC.keyId))!,
      'maker-c',
      { id: 'c-delivery-1', events: [{ id: 'c-e1', kind: 'vend.completed', machine: 'C-004', detail: { requestId: command004!.commandRef } }] },
    );

    for (const { id } of [s001, s002, s003, s004]) {
      expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('dispensed');
      expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))?.status).toBe('dispensed');
    }

    // Reliability data is attributable to the right manufacturer, from real events only.
    for (const [machine, manufacturer] of [[m001, manufacturerA], [m002, manufacturerB], [m003, manufacturerB], [m004, manufacturerC]] as const) {
      const successes = (await machineEventRepository.listByMachine(BUSINESS_ID, machine.machineId, 50)).filter(({ data }) => data.type === 'DISPENSE_SUCCESS');
      expect(successes).toHaveLength(1);
      expect(successes[0].data.manufacturerId).toBe(manufacturer.manufacturerId);
    }

    // Owners: their own machines, in Snack Quest's identity, nothing about the hardware underneath.
    const dashboardA = await ownerPortalService.getDashboard(BUSINESS_ID, ownerA);
    const dashboardB = await ownerPortalService.getDashboard(BUSINESS_ID, ownerB);
    expect(dashboardA.machines.map((card) => card.machineCode).sort()).toEqual([m001.machineCode, m002.machineCode].sort());
    expect(dashboardB.machines.map((card) => card.machineCode).sort()).toEqual([m003.machineCode, m004.machineCode].sort());
    for (const machine of [m001, m002, m003, m004]) {
      const owner = machine === m001 || machine === m002 ? ownerA : ownerB;
      const health = await ownerPortalService.getMachineHealth(BUSINESS_ID, owner, machine.machineId);
      const serialized = JSON.stringify({ dashboardA, dashboardB, health });
      for (const leak of ['snack_quest_gateway', 'reference_http', '"mock"', 'manufacturerId', 'adapterKey', 'A-001', 'B-002', 'C-004', 'Manufacturer A']) {
        expect(serialized).not.toContain(leak);
      }
    }
    await expect(ownerPortalService.getMachineHealth(BUSINESS_ID, ownerA, m003.machineId)).rejects.toThrow(PartnerDoesNotOwnMachineError);
  }, 120_000);
});

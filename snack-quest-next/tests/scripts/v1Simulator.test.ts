import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { machineSlotService } from '@/services/machineSlotService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { V1SimulatedMachine, SandboxOnlyError } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { clearIntegrationCollections, provisionMachine } from '../helpers/integrationFixtures';

/**
 * § MODEL B — the manufacturer builds against the Snack Quest Machine
 * API. A simulated manufacturer machine, speaking only the published v1
 * contract, goes from pre-registration to real (simulated) sales.
 */

const BUSINESS_ID = 'biz-v1-simulator-test';
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
});

afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
});

let machineId: string;
let simulator: V1SimulatedMachine;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);

  // Admin: register the manufacturer and model, onboard to credentials.
  const manufacturerId = await manufacturerRegistryService.createManufacturer(
    BUSINESS_ID,
    { name: 'Nairobi Vending Co', slug: 'nairobi-vending', integrationType: 'snack_quest_api', defaultAdapterKey: 'snack_quest_gateway', apiVersion: '1' },
    'staff-1',
  );
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'technical_review', 'staff-1');
  await manufacturerRegistryService.moveToStage(BUSINESS_ID, manufacturerId, 'credentials', 'staff-1');
  const modelId = await manufacturerRegistryService.createModel(
    BUSINESS_ID,
    { manufacturerId, name: 'NV-40', slug: 'nv-40', declaredCapabilities: ['vend', 'dispense_confirmation', 'inventory_read', 'heartbeat', 'telemetry', 'faults', 'temperature', 'door_status'] },
    'staff-1',
  );

  // Admin: register the machine, its slots and their manufacturer names.
  ({ machineId } = await provisionMachine(BUSINESS_ID, 'snack_quest_gateway'));
  await machineSlotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 300, capacity: 8, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 4 });
  await machineSlotService.setSlotMappings(BUSINESS_ID, machineId, [{ slotCode: 'A01', manufacturerSlotId: 'motor-11' }]);
  await machineIntegrationService.configure(BUSINESS_ID, { machineId, manufacturerId, modelId, manufacturerMachineId: 'NV-0001', environment: 'sandbox' }, 'staff-1');
  const key = await integrationCredentialService.issue(BUSINESS_ID, manufacturerId, { kind: 'api', environment: 'sandbox', label: 'firmware' }, 'staff-1');

  // Manufacturer: the machine comes online.
  simulator = new V1SimulatedMachine(new InProcessV1Transport(), key, 'NV-0001');
  simulator.load('motor-11', 4);
});

async function goLive() {
  expect((await simulator.connect()).status).toBe(200);
  expect((await simulator.heartbeat()).status).toBe(202);
  expect((await machineIntegrationService.testConnection(BUSINESS_ID, machineId, 'staff-1')).ok).toBe(true);
  await machineIntegrationService.activate(BUSINESS_ID, machineId, 'staff-1');
}

async function sell() {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `RCPT-${id.slice(0, 6)}`);
  await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  return id;
}

describe('Model B: manufacturer integrates against the Snack Quest Machine API', () => {
  it('cannot pass the TEST step before the machine has ever called in', async () => {
    const result = await machineIntegrationService.testConnection(BUSINESS_ID, machineId, 'staff-1');
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/has not contacted/);
  });

  it('a paid sale is queued, collected, acknowledged and completed — exactly once', async () => {
    await goLive();
    const transactionId = await sell();
    const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, transactionId);
    expect(command).toMatchObject({ status: 'sent', delivery: 'queued', manufacturerSlotId: 'motor-11' });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.status).toBe('vend_authorized');

    const executions = await simulator.pollAndExecute();
    expect(executions).toEqual([expect.objectContaining({ type: 'dispense', outcome: 'dispensed', reportedStatus: 200 })]);
    expect((await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.status).toBe('dispensed');
    expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, transactionId))?.statusHistory.map((entry) => entry.status)).toEqual([
      'requested',
      'authorized',
      'sent',
      'acknowledged',
      'dispensing',
      'dispensed',
    ]);

    // The firmware retries its final report (lost HTTP response): nothing moves twice.
    const resend = await simulator.resendLastReport();
    expect((resend.body as { data: { applied: boolean } }).data.applied).toBe(false);
    const sales = (await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01')).filter(({ data }) => data.reason === 'sale');
    expect(sales).toHaveLength(1);

    // Nothing left to collect.
    expect(await simulator.pollAndExecute()).toEqual([]);
  });

  it('a jam refunds the customer and never touches inventory', async () => {
    await goLive();
    simulator.queueDispenseOutcomes({ outcome: 'failed', failureCode: 'jam', reason: 'motor stalled' });
    const transactionId = await sell();
    await simulator.pollAndExecute();
    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
    expect(transaction).toMatchObject({ status: 'paid_vend_failed', dispenseFailureStatus: 'jam' });
    expect((await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01')).filter(({ data }) => data.reason === 'sale')).toHaveLength(0);
  });

  it('an unknown outcome goes to a human', async () => {
    await goLive();
    simulator.queueDispenseOutcomes({ outcome: 'unknown' });
    const transactionId = await sell();
    await simulator.pollAndExecute();
    expect((await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.status).toBe('manual_review');
  });

  it('a machine that acknowledges and goes silent is timed out by the sweep', async () => {
    await goLive();
    simulator.queueDispenseOutcomes({ outcome: 'no_report' });
    const transactionId = await sell();
    await simulator.pollAndExecute();
    expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, transactionId))?.status).toBe('dispensing');
    expect(await dispenseCommandService.sweepTimedOut(BUSINESS_ID, -1000)).toEqual({ timedOut: 1 });
  });

  it('a machine that has gone quiet is refused before the customer waits on it', async () => {
    await goLive();
    await adminFirestore.collection('machineIntegrations').doc(machineId).update({
      'signals.heartbeat': Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000)),
      'signals.api_request': Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000)),
    });
    const transactionId = await sell();
    expect((await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.status).toBe('paid_vend_failed');
    expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, transactionId))?.failureReason).toMatch(/offline/);
  });

  it('while the machine is offline its reports simply do not arrive, and resume when it returns', async () => {
    await goLive();
    simulator.goOffline();
    expect((await simulator.heartbeat()).skipped).toBe(true);
    simulator.comeBackOnline();
    expect((await simulator.heartbeat()).status).toBe(202);
  });

  it('status, inventory and events all land as normalized facts', async () => {
    await goLive();
    simulator.faults = ['E07'];
    simulator.temperatureCelsius = 14;
    await simulator.reportStatus();
    simulator.load('motor-11', 2);
    const inventory = await simulator.reportInventory();
    expect((inventory.body as { data: { mismatches: unknown[] } }).data.mismatches).toEqual([{ slotId: 'motor-11', expected: 4, reported: 2 }]);
    await simulator.sendEvents([{ type: 'DOOR_OPENED' }, { type: 'TEMPERATURE_ALERT', data: { celsius: 14 } }]);
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect(integration?.lastReportedStatus).toMatchObject({ temperatureCelsius: 14, faults: ['E07'] });
    expect(integration?.signals.inventory_sync).not.toBeNull();
  });

  it('refuses to run with production credentials', () => {
    expect(() => new V1SimulatedMachine(new InProcessV1Transport(), { keyId: 'sqk_live_abcdefgh', secret: 'x' }, 'NV-0001')).toThrow(SandboxOnlyError);
  });
});

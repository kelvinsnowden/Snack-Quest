import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { V1SimulatedMachine } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { SimulatedManufacturerCloud } from '@/scripts/vendingSimulator/webhookManufacturer';
import { dispenseCommandDocId } from '@/types';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The simulator as a stand-in for real firmware on bad days: restarts
 * (with and without flash), duplicated command delivery, lost response
 * to an outcome report, delayed responses, malformed requests,
 * reconnection — and the Model A webhook sender. Each proves a
 * server-side guarantee.
 */

const BUSINESS_ID = 'biz-simulator-scenarios';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '5'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let key: Key;
let sim: V1SimulatedMachine;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'simco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  sim = new V1SimulatedMachine(new InProcessV1Transport(), key, machine.manufacturerMachineId);
  sim.load('spiral_01', 5);
  await sim.connect();
  await sim.heartbeat();
});

async function paidOrder(): Promise<string> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `R${id.slice(0, 8)}`);
  await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  return id;
}
const saleMovements = async (id: string) => (await adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', id).where('reason', '==', 'sale').get()).size;
const moneyOf = async (id: string) => (await machineTransactionRepository.findById(BUSINESS_ID, id))?.status;

describe('simulated firmware on bad days', () => {
  it('duplicated command delivery: executed once', async () => {
    sim.inject.duplicateCommandDelivery = true;
    const id = await paidOrder();
    const executions = await sim.pollAndExecute();
    expect(executions.filter((e) => e.type === 'dispense')).toHaveLength(1);
    expect(sim.duplicatesSuppressed).toBeGreaterThanOrEqual(1);
    expect(await moneyOf(id)).toBe('dispensed');
    expect(await saleMovements(id)).toBe(1);
  });

  it('the response to the outcome report is lost: the stored report is re-sent unchanged and applied once', async () => {
    sim.inject.loseNextReportResponse = true;
    const id = await paidOrder();
    await sim.pollAndExecute();
    expect(await sim.resendOwedReports()).toBe(1);
    expect(await moneyOf(id)).toBe('dispensed');
    expect(await saleMovements(id)).toBe(1);
  });

  it('restart after dispensing, before reporting (flash kept): nothing is dispensed twice; the owed report is sent when asked', async () => {
    sim.queueDispenseOutcomes({ outcome: 'no_report' });
    const id = await paidOrder();
    await sim.pollAndExecute();
    const commandRef = (await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).get()).get('commandRef') as string;
    // The machine died before writing its report; after reboot its drop sensor log says it dropped.
    sim.persistent.executed.set(commandRef, { report: { status: 'dispensed', eventId: `post-reboot-${id}` }, reported: false });
    sim.restart();
    const again = await sim.pollAndExecute();
    expect(again.filter((e) => e.type === 'dispense')).toHaveLength(0);
    await sim.resendOwedReports([commandRef]);
    expect(await moneyOf(id)).toBe('dispensed');
    expect(await saleMovements(id)).toBe(1);
  });

  it('restart that loses flash: the server still never offers the acknowledged command again', async () => {
    sim.queueDispenseOutcomes({ outcome: 'no_report' });
    await paidOrder();
    await sim.pollAndExecute();
    sim.restart({ loseFlash: true });
    const again = await sim.pollAndExecute();
    expect(again.filter((e) => e.type === 'dispense')).toHaveLength(0);
  });

  it('a slow link (delayed responses) still completes the sale exactly once', async () => {
    sim.inject.delayMs = 150;
    const id = await paidOrder();
    await sim.pollAndExecute();
    expect(await moneyOf(id)).toBe('dispensed');
    expect(await saleMovements(id)).toBe(1);
  });

  it('a malformed request is refused and the next one works', async () => {
    sim.inject.malformedNextRequest = true;
    const bad = await sim.heartbeat();
    expect(bad.status).toBe(400);
    expect((await sim.heartbeat()).status).toBe(202);
  });

  it('reconnect after a short outage: the queued sale is collected when it comes back (within the command window)', async () => {
    sim.goOffline();
    const id = await paidOrder();
    expect((await sim.pollAndExecute()).length).toBe(0);
    sim.comeBackOnline();
    await sim.pollAndExecute();
    expect(await moneyOf(id)).toBe('dispensed');
  });
});

describe('Model A: the manufacturer cloud sends webhooks', () => {
  it('signed deliveries are accepted, re-deliveries are duplicates, a malformed one is a 422, a skewed clock is refused', async () => {
    const ids = await onboardManufacturer(BUSINESS_ID, 'cloudco');
    const outbound = await activeMachine(BUSINESS_ID, ids);
    const hook = await apiKey(BUSINESS_ID, ids.manufacturerId, { kind: 'webhook' });
    const cloud = new SimulatedManufacturerCloud(new InProcessV1Transport().fetch as never, hook, 'cloudco');
    cloud.inject.redeliver = 2;
    const results = await cloud.send([{ type: 'DOOR_OPENED', machineId: outbound.manufacturerMachineId }]);
    expect(results.map((r) => r.status)).toEqual([202, 200, 200]);
    const doors = await adminFirestore.collection('machineEvents').where('machineId', '==', outbound.machineId).where('type', '==', 'DOOR_OPENED').get();
    expect(doors.size).toBe(1);
    cloud.inject.redeliver = 0;
    cloud.inject.malformedNext = true;
    expect((await cloud.send([]))[0]).toMatchObject({ status: 422 });
    cloud.inject.clockSkewSeconds = -1200;
    expect((await cloud.send([{ type: 'DOOR_CLOSED', machineId: outbound.manufacturerMachineId }]))[0]).toMatchObject({ status: 401, code: 'stale_timestamp' });
  });
});

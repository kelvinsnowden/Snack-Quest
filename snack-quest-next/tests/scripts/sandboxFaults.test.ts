import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { V1SimulatedMachine } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, type V1Machine } from '../helpers/v1TestHarness';

/** The sandbox's fault injection does what it says, and the platform survives each fault. */

const BUSINESS_ID = 'biz-sandbox-faults';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '7'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let sim: V1SimulatedMachine;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'faultco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  sim = new V1SimulatedMachine(new InProcessV1Transport(), await apiKey(BUSINESS_ID, ids.manufacturerId), machine.manufacturerMachineId);
  await sim.connect();
});

const doorEvents = async () => (await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', 'in', ['DOOR_OPENED', 'DOOR_CLOSED']).get()).size;

describe('sandbox fault injection', () => {
  it('malformed request: a 400, and the next request is normal again', async () => {
    sim.inject.malformedNextRequest = true;
    expect((await sim.heartbeat()).status).toBe(400);
    expect((await sim.heartbeat()).status).toBe(202);
  });

  it('duplicate events: recorded once', async () => {
    sim.inject.duplicateEvents = true;
    const second = await sim.sendEvents([{ type: 'DOOR_OPENED' }, { type: 'DOOR_CLOSED' }]);
    expect((second.body as { data: { duplicates: number } }).data.duplicates).toBe(2);
    expect(await doorEvents()).toBe(2);
  });

  it('out-of-order status: an older snapshot never overwrites a newer one', async () => {
    await sim.reportStatus();
    sim.inject.outOfOrderEvents = true;
    sim.doorOpen = true;
    const late = await sim.reportStatus();
    expect((late.body as { data: { applied: boolean } }).data.applied).toBe(false);
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machine.machineId))?.lastReportedStatus?.doorOpen).toBe(false);
  });

  it('heartbeat failure: nothing is sent, and the request log shows it', async () => {
    const before = sim.requestLog.length;
    sim.inject.heartbeatFailure = true;
    expect((await sim.heartbeat()) as { skipped?: boolean }).toMatchObject({ skipped: true });
    expect(sim.requestLog.length).toBe(before);
  });

  it('delayed responses: still correct, just slower', async () => {
    sim.inject.delayMs = 50;
    const started = Date.now();
    expect((await sim.heartbeat()).status).toBe(202);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

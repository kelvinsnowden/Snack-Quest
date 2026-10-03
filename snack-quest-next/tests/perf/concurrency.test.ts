import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { V1SimulatedMachine } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Concurrency, measured on the Firestore emulator. The numbers printed
 * are what this test observed on this machine — they are not production
 * capacity claims (the emulator is single-process and slower than
 * Firestore; production throughput must be measured in staging).
 */

const BUSINESS_ID = 'biz-concurrency';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '7'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let ids: { manufacturerId: string; modelId: string };
let key: Key;
beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  ids = await onboardManufacturer(BUSINESS_ID, 'loadco', { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
});

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

describe('concurrency', () => {
  it('two customers buy the last item at the same moment: one gets it, the other is refunded, stock never goes negative', async () => {
    const machine: V1Machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway', quantity: 1 });
    const sim = new V1SimulatedMachine(new InProcessV1Transport(), key, machine.manufacturerMachineId);
    sim.load('spiral_01', 1);
    await sim.connect();
    await sim.heartbeat();
    const buy = async (receipt: string) => {
      const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, receipt);
      await machineTransactionService.authorizeVend(BUSINESS_ID, id);
      return id;
    };
    const [a, b] = await Promise.all([buy('RLASTA'), buy('RLASTB')]);
    await sim.pollAndExecute();
    const statuses = [(await machineTransactionRepository.findById(BUSINESS_ID, a))?.status, (await machineTransactionRepository.findById(BUSINESS_ID, b))?.status].sort();
    expect(statuses).toEqual(['dispensed', 'paid_vend_failed']);
    const slot = await adminFirestore.collection('machineSlots').doc(`${machine.machineId}__A01`).get();
    expect(slot.get('currentQuantity')).toBe(0);
    const sales = await adminFirestore.collection('machineInventoryMovements').where('machineId', '==', machine.machineId).where('reason', '==', 'sale').get();
    expect(sales.size).toBe(1);
  }, 60_000);

  it('once the ledger shows it sold out, the next customer is refused before paying', async () => {
    const machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway', quantity: 0 });
    await expect(machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' })).rejects.toThrow(/out of stock/);
  });

  it('25 machines heartbeat and poll at the same time: every request answered correctly (latency printed, not asserted)', async () => {
    const machines = await Promise.all(Array.from({ length: 25 }, () => activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' })));
    const latencies: number[] = [];
    const timed = async <T>(run: () => Promise<T>) => {
      const started = performance.now();
      const result = await run();
      latencies.push(performance.now() - started);
      return result;
    };
    const started = performance.now();
    const results = await Promise.all(
      machines.flatMap((m) => [
        timed(() => v1(key, m.machineCode).heartbeat({ eventId: `hb-${m.machineCode}` })),
        timed(() => v1(key, m.machineCode).commands()),
      ]),
    );
    const wall = performance.now() - started;
    console.log(`\n50 concurrent requests from 25 machines (emulator): wall ${Math.round(wall)} ms, p50 ${Math.round(percentile(latencies, 0.5))} ms, p95 ${Math.round(percentile(latencies, 0.95))} ms\n`);
    expect(results.filter((r) => r.status === 202 || r.status === 200)).toHaveLength(50);
  }, 120_000);

  it('20 concurrent sales on 20 machines each dispatch exactly once', async () => {
    const machines = await Promise.all(Array.from({ length: 20 }, () => activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' })));
    const sales = await Promise.all(
      machines.map(async (m) => {
        const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: m.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
        await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `RC${m.machineCode.slice(-6)}`);
        await Promise.all([machineTransactionService.authorizeVend(BUSINESS_ID, id), machineTransactionService.authorizeVend(BUSINESS_ID, id)]);
        return id;
      }),
    );
    const commands = await adminFirestore.collection('machineDispenseCommands').where('businessId', '==', BUSINESS_ID).get();
    expect(commands.size).toBe(20);
    expect(new Set(commands.docs.map((doc) => doc.get('transactionId')))).toEqual(new Set(sales));
  }, 120_000);
});

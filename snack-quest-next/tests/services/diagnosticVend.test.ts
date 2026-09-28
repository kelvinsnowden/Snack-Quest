import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService, DiagnosticVendRequestError, SlotUnavailableForSaleError } from '@/services/machineTransactionService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { deepReconciliationService } from '@/services/deepReconciliationService';
import { saleTraceService } from '@/services/saleTraceService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The admin "Test vend" used to call the adapter directly, outside the
 * dispense ledger: for a machine that polls (Model B) it reported
 * "authorized" while queuing nothing, and for any adapter it left a
 * physical vend with no record, no stock movement and no protection
 * against a double click. It now goes through the ledger like a sale.
 * These tests hold it to that — and to never being mistaken for a sale.
 */

const BUSINESS_ID = 'biz-diagnostic-vend';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'd'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let key: Key;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  await adminFirestore.recursiveDelete(adminFirestore.collection('alerts'));
  const ids = await onboardManufacturer(BUSINESS_ID, 'diagco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

const start = (requestId: string, slotCode = 'A01') => machineTransactionService.startDiagnosticVend({ businessId: BUSINESS_ID, machineId: machine.machineId, slotCode, requestId, actor: 'staff-1' });

async function movementsFor(transactionId: string) {
  const snapshot = await adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', transactionId).get();
  return snapshot.docs.map((doc) => doc.data() as { reason: string; quantityDelta: number });
}

describe('diagnostic (test) vend', () => {
  it('reaches a polling machine as a real dispense command, and its outcome is recorded — as waste, not a sale', async () => {
    const result = await start('req-model-b-0001');
    expect(result).toMatchObject({ replay: false, authorized: true, commandStatus: 'sent' });

    // The machine really receives it — the old path queued nothing.
    const client = v1(key, machine.machineCode);
    const poll = await client.commands();
    expect(poll.data.commands.map((command) => command.commandId)).toEqual([result.commandRef]);
    expect((await client.ack(result.commandRef!)).status).toBe(200);
    expect((await client.report(result.commandRef!, { status: 'dispensed', eventId: 'diag-out-1' })).status).toBe(200);

    const transaction = await machineTransactionRepository.findById(BUSINESS_ID, result.transactionId);
    expect(transaction).toMatchObject({ status: 'dispensed', paymentMethod: 'diagnostic', amountKes: 0 });
    expect(await movementsFor(result.transactionId)).toEqual([expect.objectContaining({ reason: 'waste', quantityDelta: -1 })]);
  });

  it('the same request id never dispenses twice — a double click or retry returns the first vend', async () => {
    const first = await start('req-double-click');
    const second = await start('req-double-click');
    expect(second).toMatchObject({ replay: true, transactionId: first.transactionId, commandRef: first.commandRef });
    const commands = await adminFirestore.collection('machineDispenseCommands').where('businessId', '==', BUSINESS_ID).get();
    expect(commands.size).toBe(1);
    // A new request id is a new, deliberate vend.
    const third = await start('req-second-vend');
    expect(third.transactionId).not.toBe(first.transactionId);
  });

  it('is never counted as a sale: no revenue, no units sold, no transactions in settlement', async () => {
    const result = await start('req-not-a-sale');
    const client = v1(key, machine.machineCode);
    await client.ack(result.commandRef!);
    await client.report(result.commandRef!, { status: 'dispensed', eventId: 'diag-out-2' });

    const now = new Date();
    const gross = await machineSettlementService.computeGrossForPeriod(BUSINESS_ID, machine.machineId, new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 86_400_000));
    expect(gross).toMatchObject({ grossSalesKes: 0, transactionCount: 0 });
    for (const offset of [-1, 0, 1]) {
      const day = new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
      const rollup = await vendingRollupService.computeMachineDay(BUSINESS_ID, machine.machineId, day);
      expect(rollup).toMatchObject({ unitsSold: 0, grossSalesKes: 0 });
    }
    const [trace] = await saleTraceService.trace(BUSINESS_ID, { transactionId: result.transactionId });
    expect(trace.summary).toMatch(/Staff test vend/);
  });

  it('a machine that cannot collect it: not dispensed, and no refund is owed to anyone', async () => {
    // Silence the machine so it is offline to the gateway.
    await machineIntegrationRepository.recordSignal(machine.machineId, 'heartbeat');
    await adminFirestore.collection('machineIntegrations').doc(machine.machineId).update({ 'signals.heartbeat': null, 'signals.api_request': null, 'signals.webhook': null });
    const result = await start('req-offline-0001');
    expect(result.authorized).toBe(false);
    expect(result.commandStatus).toBe('rejected');
    expect((await machineTransactionRepository.findById(BUSINESS_ID, result.transactionId))?.status).toBe('paid_vend_failed');

    await adminFirestore.collection('machineTransactions').doc(result.transactionId).update({ updatedAt: new Date(Date.now() - 2 * 86_400_000) });
    const report = await deepReconciliationService.run(BUSINESS_ID);
    expect(report.discrepancies.filter((d) => d.transactionId === result.transactionId)).toEqual([]);
  });

  it('refuses a malformed request id or an unconfigured slot before anything is created', async () => {
    await expect(start('x')).rejects.toBeInstanceOf(DiagnosticVendRequestError);
    await expect(start('req-bad-slot-01', 'Z99')).rejects.toBeInstanceOf(SlotUnavailableForSaleError);
    const created = await adminFirestore.collection('machineTransactions').where('businessId', '==', BUSINESS_ID).get();
    expect(created.size).toBe(0);
    expect(await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, 'nothing')).toBeNull();
  });
});

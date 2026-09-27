import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { saleTraceService } from '@/services/saleTraceService';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { dispenseCommandDocId } from '@/types';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * "A customer paid at 14:32 and didn't receive their snack" — support
 * must be able to answer that from one lookup, by whatever the customer
 * has: their M-Pesa receipt, or just the machine and the time.
 */

const BUSINESS_ID = 'biz-sale-trace';
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
  const webhooks = await adminFirestore.collection('webhookEvents').where('businessId', '==', BUSINESS_ID).get();
  await Promise.all(webhooks.docs.map((doc) => doc.ref.delete()));
  const ids = await onboardManufacturer(BUSINESS_ID, 'trace', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids);
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

/** A sale paid the real way: STK push → Safaricom's callback → dispatch. */
async function paidByMpesa(receipt: string): Promise<string> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  const checkoutRequestId = `ws_CO_${id}`;
  await adminFirestore.collection('machineTransactions').doc(id).update({ checkoutRequestId });
  const sale = (await adminFirestore.collection('machineTransactions').doc(id).get()).data()!;
  const outcome = await machineTransactionService.handleMpesaCallback(BUSINESS_ID, { checkoutRequestId, merchantRequestId: 'm-1', resultCode: 0, resultDesc: 'ok', amountKes: sale.amountKes, mpesaReceiptNumber: receipt, phoneNumber: '254700000000' });
  expect(outcome).toMatchObject({ handled: true, outcome: 'succeeded' });
  return id;
}

describe('sale trace', () => {
  it('by M-Pesa receipt: a delivered sale, with every ledger in one ordered timeline', async () => {
    const id = await paidByMpesa('RCP123TRACE');
    const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
    await v1(key, machine.machineCode).ack(command!.commandRef);
    await v1(key, machine.machineCode).report(command!.commandRef, { status: 'dispensed', eventId: `ok-${id}` });

    const [trace] = await saleTraceService.trace(BUSINESS_ID, { paymentRef: 'RCP123TRACE' });
    expect(trace).toMatchObject({ transactionId: id, verdict: 'delivered', machineCode: machine.machineCode, commandStatus: 'dispensed' });
    const sources = new Set(trace.timeline.map((step) => step.source));
    for (const source of ['payment', 'mpesa', 'dispense', 'stock']) {
      expect(sources).toContain(source);
    }
    const times = trace.timeline.map((step) => step.at);
    expect([...times].sort()).toEqual(times);
    // The customer's phone number is in the stored callback; it must not leak into the trace.
    expect(JSON.stringify(trace)).not.toContain('254700000000');
  });

  it('by machine and approximate time, when the customer has no receipt', async () => {
    const id = await paidByMpesa('RCPWINDOW');
    const traces = await saleTraceService.trace(BUSINESS_ID, { machineCode: machine.machineCode, at: new Date(), windowMinutes: 10 });
    expect(traces.map((t) => t.transactionId)).toContain(id);
    expect(await saleTraceService.trace(BUSINESS_ID, { machineCode: machine.machineCode, at: new Date(Date.now() - 3 * 3_600_000), windowMinutes: 10 })).toEqual([]);
  });

  it('a dispense the machine never collected reads as "refund owed", with the reason', async () => {
    const id = await paidByMpesa('RCPREFUND');
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)) });
    await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id);
    const [trace] = await saleTraceService.trace(BUSINESS_ID, { transactionId: id });
    expect(trace.verdict).toBe('refund_owed');
    expect(trace.summary).toMatch(/owed KES/);
    expect(trace.timeline.some((step) => step.what === 'Dispense timeout')).toBe(true);
  });

  it('unknown references return nothing rather than guessing', async () => {
    expect(await saleTraceService.trace(BUSINESS_ID, { paymentRef: 'NOPE' })).toEqual([]);
    expect(await saleTraceService.trace(BUSINESS_ID, { commandRef: 'NOPE' })).toEqual([]);
    expect(await saleTraceService.trace(BUSINESS_ID, { machineCode: 'NOPE', at: new Date() })).toEqual([]);
  });
});

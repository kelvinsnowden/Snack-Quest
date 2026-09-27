import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { dispenseCommandDocId } from '@/types';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Fast recovery: every stuck state between payment and outcome that can
 * be resolved *provably*, is — and nothing that may have dispensed is
 * ever refunded or retried automatically.
 */

const BUSINESS_ID = 'biz-dispense-recovery';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
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
  // The inbound (Model B) adapter: dispenses are queued for the machine to poll.
  const ids = await onboardManufacturer(BUSINESS_ID, 'recovery', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids);
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

async function paid(): Promise<string> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `RCPT-${id.slice(0, 5)}`);
  return id;
}

const statusOf = async (id: string) => (await machineTransactionRepository.findById(BUSINESS_ID, id))?.status;
const commandOf = (id: string) => machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
const age = (doc: FirebaseFirestore.DocumentReference, fields: Record<string, number>) =>
  doc.update(Object.fromEntries(Object.entries(fields).map(([field, secondsAgo]) => [field, Timestamp.fromDate(new Date(Date.now() - secondsAgo * 1000))])));

describe('paid but never dispatched (the dispatcher died after payment)', () => {
  it('within the customer window: dispatches now, exactly once', async () => {
    const id = await paid();
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('dispatched');
    expect((await commandOf(id))?.status).toBe('sent');
    expect(await statusOf(id)).toBe('vend_authorized');
    // A second recovery run (or the late original) finds the claim and does nothing.
    expect(await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id)).toBeNull();
  });

  it('after the customer window: refund path, nothing ever sent', async () => {
    const id = await paid();
    await age(adminFirestore.collection('machineTransactions').doc(id), { paidAt: 300, updatedAt: 300 });
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('refunded_never_dispatched');
    expect(await statusOf(id)).toBe('paid_vend_failed');
    expect(await commandOf(id)).toBeNull();
  });
});

describe('dispatch interrupted part-way', () => {
  it('claimed (requested) but never sent → refund path', async () => {
    const id = await paid();
    await machineDispenseCommandRepository.claim({ businessId: BUSINESS_ID, machineId: machine.machineId, machineCode: machine.machineCode, transactionId: id, paymentRef: 'R', slotCode: 'A01', manufacturerSlotId: 'spiral_01', productId: 'pkg-1', quantity: 1, adapterKey: 'snack_quest_gateway', requestedBy: 'test', expiresAt: new Date(Date.now() + 120_000) });
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)), { updatedAt: 120 });
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('refunded_never_sent');
    expect((await commandOf(id))?.status).toBe('rejected');
    expect(await statusOf(id)).toBe('paid_vend_failed');
  });

  it('authorized on an inbound integration but never queued → refund path (the machine could not have seen it)', async () => {
    const id = await paid();
    await machineDispenseCommandRepository.claim({ businessId: BUSINESS_ID, machineId: machine.machineId, machineCode: machine.machineCode, transactionId: id, paymentRef: 'R', slotCode: 'A01', manufacturerSlotId: 'spiral_01', productId: 'pkg-1', quantity: 1, adapterKey: 'snack_quest_gateway', requestedBy: 'test', expiresAt: new Date(Date.now() + 120_000) });
    await machineDispenseCommandRepository.moveStatus(BUSINESS_ID, id, 'authorized');
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)), { updatedAt: 120 });
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('refunded_never_sent');
  });

  it('authorized on an OUTBOUND integration → unknown and review, never refunded (the request may have gone out)', async () => {
    const id = await paid();
    await machineDispenseCommandRepository.claim({ businessId: BUSINESS_ID, machineId: machine.machineId, machineCode: machine.machineCode, transactionId: id, paymentRef: 'R', slotCode: 'A01', manufacturerSlotId: 'spiral_01', productId: 'pkg-1', quantity: 1, adapterKey: 'reference_http', requestedBy: 'test', expiresAt: new Date(Date.now() + 120_000) });
    await machineDispenseCommandRepository.moveStatus(BUSINESS_ID, id, 'authorized');
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)), { updatedAt: 120 });
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('review_maybe_delivered');
    expect((await commandOf(id))?.status).toBe('unknown');
    expect(await statusOf(id)).toBe('manual_review');
  });
});

describe('queued for the machine', () => {
  it('uncollected past expiry → refund path, and the machine is refused if it acknowledges late', async () => {
    const id = await paid();
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const command = await commandOf(id);
    expect(command?.status).toBe('sent');
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)), { expiresAt: 60 });
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('refunded_never_collected');
    expect(await statusOf(id)).toBe('paid_vend_failed');
    const late = await v1(key, machine.machineCode).ack(command!.commandRef);
    expect(late.status).toBe(409);
  });

  it('the machine\'s own command poll resolves its expired commands without any sweep', async () => {
    const id = await paid();
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)), { expiresAt: 60 });
    const poll = await v1(key, machine.machineCode).commands();
    expect(poll.data.commands).toEqual([]);
    expect(await statusOf(id)).toBe('paid_vend_failed');
  });

  it('acknowledged with no outcome for 5+ minutes → timeout and review; the machine is asked to report it', async () => {
    const id = await paid();
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const command = await commandOf(id);
    await v1(key, machine.machineCode).ack(command!.commandRef);
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)), { updatedAt: 600 });
    expect((await dispenseRecoveryService.recoverTransaction(BUSINESS_ID, id))?.action).toBe('review_no_outcome');
    expect(await statusOf(id)).toBe('manual_review');
    const beat = await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
    expect((beat.data as { reportOutcomes: { commandId: string }[] }).reportOutcomes).toEqual([{ commandId: command!.commandRef, reason: 'no_outcome_received' }]);
    // The machine answers — the late truth resolves it.
    const reported = await v1(key, machine.machineCode).report(command!.commandRef, { status: 'dispensed', eventId: `late-${Date.now()}` });
    expect(reported.data).toMatchObject({ applied: true, result: 'applied' });
    expect(await statusOf(id)).toBe('dispensed');
  });
});

describe('sweep', () => {
  it('finds and resolves every stuck sale in one pass, and a second pass does nothing', async () => {
    const neverDispatched = await paid();
    await age(adminFirestore.collection('machineTransactions').doc(neverDispatched), { paidAt: 300, updatedAt: 300 });
    const uncollected = await paid();
    await machineTransactionService.authorizeVend(BUSINESS_ID, uncollected);
    await age(adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(uncollected)), { expiresAt: 60, updatedAt: 120 });

    const first = await dispenseRecoveryService.sweep(BUSINESS_ID);
    expect(first.recovered.refunded_never_dispatched).toBe(1);
    expect(first.recovered.refunded_never_collected).toBe(1);
    const second = await dispenseRecoveryService.sweep(BUSINESS_ID);
    expect(Object.values(second.recovered).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('orders and polling', () => {
  it('a machine that has gone quiet is refused before the customer pays', async () => {
    await age(adminFirestore.collection('machineIntegrations').doc(machine.machineId), { 'signals.heartbeat': 600, 'signals.api_request': 600 });
    await expect(machineTransactionService.initiateCartPayment({ businessId: BUSINESS_ID, machineId: machine.machineId, slotIds: ['A01'], phoneNumber: '254700000000' })).rejects.toThrow(/not accepting orders/);
  });

  it('a machine in maintenance is refused before the customer pays', async () => {
    await machineIntegrationRepository.setMaintenance(BUSINESS_ID, machine.machineId, new Date(Date.now() + 3_600_000), 'restocking', 'staff-1');
    await expect(machineTransactionService.initiateCartPayment({ businessId: BUSINESS_ID, machineId: machine.machineId, slotIds: ['A01'], phoneNumber: '254700000000' })).rejects.toThrow(/not accepting orders/);
  });

  it('idle polls skip the command queries; a queued command is still collected on the next poll', async () => {
    const idle = await v1(key, machine.machineCode).commands();
    expect(idle.data.commands).toEqual([]);
    expect(idle.data.nextPollSeconds).toBe(10);
    const id = await paid();
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const poll = await v1(key, machine.machineCode).commands();
    expect(poll.data.commands.map((command) => command.type)).toEqual(['dispense']);
  });

  it('asks for fast polling while a customer is paying', async () => {
    await machineIntegrationRepository.noteOrderExpected(machine.machineId, new Date(Date.now() + 60_000));
    expect((await v1(key, machine.machineCode).commands()).data.nextPollSeconds).toBe(2);
  });
});

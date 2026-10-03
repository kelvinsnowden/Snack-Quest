import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { PaymentGateway, StkPushResult, StkQueryResult } from '@/lib/integrations/types';
import { MachineTransactionService, machineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Chaos cases not covered elsewhere (docs/CHAOS_FAILURE_MATRIX.md maps
 * every case to its evidence): the datastore failing mid-request, and
 * Safaricom's payment callback never arriving. The invariant each time:
 * nobody is dispensed to without a confirmed payment, and nobody who
 * paid is silently dropped.
 */

const BUSINESS_ID = 'biz-chaos';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '8'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});
afterEach(() => vi.restoreAllMocks());

let machine: V1Machine;
let key: Key;
beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'chaosco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

describe('the datastore fails mid-request', () => {
  it('an outcome report hitting a transient Firestore error gets 503 + Retry-After; the retry with the same eventId is applied once', async () => {
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RCHAOS1');
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const commandRef = (await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))!.commandRef;
    const client = v1(key, machine.machineCode);
    await client.ack(commandRef);

    const original = machineTransactionRepository.moveStatus.bind(machineTransactionRepository);
    const spy = vi.spyOn(machineTransactionRepository, 'moveStatus').mockImplementationOnce(async () => {
      throw Object.assign(new Error('UNAVAILABLE: datastore'), { code: 14 });
    });
    const failed = await client.report(commandRef, { status: 'dispensed', eventId: `chaos-${id}` });
    expect(failed.status).toBe(503);
    expect(failed.error?.code).toBe('temporarily_unavailable');
    expect(failed.headers.get('retry-after')).toBe('2');
    spy.mockImplementation(original);

    const retried = await client.report(commandRef, { status: 'dispensed', eventId: `chaos-${id}` });
    expect(retried.status).toBe(200);
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('dispensed');
    const sales = await adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', id).where('reason', '==', 'sale').get();
    expect(sales.size).toBe(1);
  });
});

class QueryableGateway implements PaymentGateway {
  query: StkQueryResult | null = null;
  async initiateStkPush(): Promise<StkPushResult> {
    return { merchantRequestId: 'mr-chaos', checkoutRequestId: `ws_CO_chaos_${Date.now()}_${Math.random()}`, responseCode: '0', responseDescription: 'ok', customerMessage: 'Enter PIN' };
  }
  verifyCallback(): never {
    throw new Error('unused');
  }
  async queryStkStatus(input: { checkoutRequestId: string }): Promise<StkQueryResult> {
    return { merchantRequestId: 'mr-chaos', checkoutRequestId: input.checkoutRequestId, responseCode: '0', responseDescription: 'ok', resultCode: 0, resultDesc: 'ok', ...this.query };
  }
}

describe('the dispatcher dies between queuing the dispense and recording it on the sale', () => {
  it('the machine already collected, dispensed and reported: the report is matched through the command ledger and the sale completes once', async () => {
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RCHAOS2');
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const commandRef = (await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))!.commandRef;
    // The crash: the command is visible to the machine, but the sale never moved past "paid" and never learned its vend reference.
    await adminFirestore.collection('machineTransactions').doc(id).update({ status: 'paid', vendRef: null });

    const client = v1(key, machine.machineCode);
    expect((await client.commands()).data.commands.map((command) => command.commandId)).toContain(commandRef);
    expect((await client.ack(commandRef)).status).toBe(200);
    const report = await client.report(commandRef, { status: 'dispensed', eventId: `chaos-${id}` });
    expect(report.data).toMatchObject({ applied: true, result: 'applied' });

    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('dispensed');
    const movements = await adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', id).get();
    expect(movements.size).toBe(1);
    const unrecognised = await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', '==', 'DISPENSE_UNRECOGNISED').get();
    expect(unrecognised.size).toBe(0);
  });
});

describe("Safaricom's payment callback never arrives", () => {
  let gateway: QueryableGateway;
  let service: MachineTransactionService;
  beforeEach(() => {
    gateway = new QueryableGateway();
    service = new MachineTransactionService(undefined, gateway);
  });
  const stuckSale = async (phone: string) => {
    const cart = await service.initiateCartPayment({ businessId: BUSINESS_ID, machineId: machine.machineId, slotIds: ['A01'], phoneNumber: phone });
    const id = cart.transactions[0].id;
    await adminFirestore.collection('machineTransactions').doc(id).update({ updatedAt: Timestamp.fromMillis(Date.now() - 10 * 60_000) });
    return id;
  };
  const dispensed = async (id: string) => Boolean(await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id));

  it('Daraja says it succeeded: held for a human with the M-Pesa statement — never dispensed on a query alone', async () => {
    const id = await stuckSale('254711000001');
    gateway.query = { resultCode: 0, resultDesc: 'The service request is processed successfully.' } as StkQueryResult;
    expect(await service.reconcileStuckPendingTransactions(BUSINESS_ID)).toMatchObject({ flaggedForManualReview: 1 });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('manual_review');
    expect(await dispensed(id)).toBe(false);
  });

  it('Daraja says it failed or was cancelled: payment_failed, nothing dispensed', async () => {
    const id = await stuckSale('254711000002');
    gateway.query = { resultCode: 1032, resultDesc: 'Request cancelled by user' } as StkQueryResult;
    expect(await service.reconcileStuckPendingTransactions(BUSINESS_ID)).toMatchObject({ resolvedFailed: 1 });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('payment_failed');
    expect(await dispensed(id)).toBe(false);
  });

  it('Daraja has no answer: still pending, and after the expiry window a human looks — nobody who paid is dropped', async () => {
    const id = await stuckSale('254711000003');
    gateway.query = { responseCode: '500.001.1001', resultCode: -1 } as StkQueryResult;
    expect(await service.reconcileStuckPendingTransactions(BUSINESS_ID)).toMatchObject({ stillPending: 1 });
    await adminFirestore.collection('machineTransactions').doc(id).update({ updatedAt: Timestamp.fromMillis(Date.now() - 7 * 3600_000) });
    expect(await service.reconcileStuckPendingTransactions(BUSINESS_ID)).toMatchObject({ flaggedForManualReview: 1 });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.status).toBe('manual_review');
  });
});

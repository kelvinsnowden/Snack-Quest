import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import type { PaymentGateway, StkPushResult, StkQueryResult } from '@/lib/integrations/types';

/**
 * M-Pesa wiring for vending (§ M-PESA ARCHITECTURE,
 * docs/VENDING_OS_BENCHMARK.md §C/§H). `PaymentGateway` is faked
 * rather than hitting Daraja — `darajaGateway`'s own real request-
 * building/HTTP behaviour is already covered by
 * `tests/integrations/darajaGateway.test.ts`; what's under test here
 * is `MachineTransactionService`'s own orchestration: does it call
 * the gateway with the right amount, does it persist the correlation
 * ids, does a verified payment actually authorize a vend, and — the
 * property every test in this file ultimately protects — can a
 * device's own claim ever substitute for one of Safaricom's.
 */

const BUSINESS_ID = 'biz-vending-payment-flow-test';

class FakePaymentGateway implements PaymentGateway {
  initiateStkPushMock = vi.fn<PaymentGateway['initiateStkPush']>();
  async initiateStkPush(input: Parameters<PaymentGateway['initiateStkPush']>[0]): Promise<StkPushResult> {
    return this.initiateStkPushMock(input);
  }
  verifyCallback(): never {
    throw new Error('not used in these tests — the webhook route parses callbacks, the service receives already-parsed results');
  }
  async queryStkStatus(): Promise<StkQueryResult> {
    throw new Error('not used in these tests');
  }
}

async function seedMachineWithSlot(adapter: MockVendingAdapter, quantity = 5) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test-model',
    actor: 'staff-1',
  });
  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({
    businessId: BUSINESS_ID,
    machineId,
    slotCode: 'A01',
    productId: 'pkg-1',
    productCatalogue: 'package',
    priceKes: 350,
    capacity: 10,
    position: 1,
  });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId };
}

beforeEach(async () => {
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'machineTelemetryEvents', 'deviceCredentials', 'restockTasks', 'webhookEvents']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('initiateMpesaPayment', () => {
  it('creates a pending transaction, requests an STK push for the slot price, and persists the correlation ids', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    gateway.initiateStkPushMock.mockResolvedValue({
      merchantRequestId: 'mr-1',
      checkoutRequestId: 'ws_CO_1',
      responseCode: '0',
      responseDescription: 'Success',
      customerMessage: 'Enter your PIN',
    });
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter, gateway);

    const result = await service.initiateMpesaPayment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', phoneNumber: '254712345678' });

    expect(result.checkoutRequestId).toBe('ws_CO_1');
    expect(gateway.initiateStkPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID, phone: '254712345678', amountKes: 350, accountReference: result.transactionRef }),
    );

    const transaction = await service.findById(BUSINESS_ID, result.id);
    expect(transaction?.status).toBe('pending');
    expect(transaction?.checkoutRequestId).toBe('ws_CO_1');
    expect(transaction?.merchantRequestId).toBe('mr-1');
    expect(transaction?.paymentMethod).toBe('mpesa');
  });

  it('moves the transaction to payment_failed when the STK push itself cannot be sent', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    gateway.initiateStkPushMock.mockRejectedValue(new Error('Daraja STK push failed: invalid credentials'));
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter, gateway);

    await expect(service.initiateMpesaPayment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', phoneNumber: '254712345678' })).rejects.toThrow(
      'Daraja STK push failed',
    );

    const found = await adminFirestore.collection('machineTransactions').where('machineId', '==', machineId).get();
    expect(found.docs).toHaveLength(1);
    expect(found.docs[0].data().status).toBe('payment_failed');
    expect(found.docs[0].data().checkoutRequestId).toBeNull();
  });

  it('refuses a slot with no stock before ever calling the payment gateway', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter, 0);
    const service = new MachineTransactionService(() => adapter, gateway);

    await expect(service.initiateMpesaPayment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', phoneNumber: '254712345678' })).rejects.toThrow(
      'out of stock',
    );
    expect(gateway.initiateStkPushMock).not.toHaveBeenCalled();
  });
});

describe('handleMpesaCallback', () => {
  async function initiatePayment(adapter: MockVendingAdapter, gateway: FakePaymentGateway, machineId: string, checkoutRequestId = 'ws_CO_1') {
    gateway.initiateStkPushMock.mockResolvedValue({
      merchantRequestId: 'mr-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'Success',
      customerMessage: 'Enter your PIN',
    });
    const service = new MachineTransactionService(() => adapter, gateway);
    const { id } = await service.initiateMpesaPayment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', phoneNumber: '254712345678' });
    return { service, id };
  }

  it('verifies payment and authorizes the vend on a matching, successful callback', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const { service, id } = await initiatePayment(adapter, gateway, machineId);

    const outcome = await service.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'mr-1',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 350,
      mpesaReceiptNumber: 'RECEIPT1',
    });

    expect(outcome).toEqual({ handled: true, transactionId: id, outcome: 'succeeded' });
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('vend_authorized');
    expect(transaction?.paymentRef).toBe('RECEIPT1');
    expect(transaction?.vendRef).toBeTruthy();
  });

  it('marks payment_failed on a failed callback, and never authorizes a vend', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const { service, id } = await initiatePayment(adapter, gateway, machineId);

    const outcome = await service.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'mr-1',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    });

    expect(outcome).toEqual({ handled: true, transactionId: id, outcome: 'failed' });
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('payment_failed');
    expect(transaction?.vendRef).toBeNull();
  });

  it('returns handled:false for a checkoutRequestId that belongs to no vending transaction', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const service = new MachineTransactionService(() => adapter, gateway);

    const outcome = await service.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_unknown',
      merchantRequestId: 'mr-x',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 500,
      mpesaReceiptNumber: 'X',
    });

    expect(outcome).toEqual({ handled: false });
  });

  it('is idempotent: a duplicate delivery of the same successful callback never double-authorizes', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const { service, id } = await initiatePayment(adapter, gateway, machineId);

    const callback = {
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'mr-1',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 350,
      mpesaReceiptNumber: 'RECEIPT1',
    };
    const first = await service.handleMpesaCallback(BUSINESS_ID, callback);
    const second = await service.handleMpesaCallback(BUSINESS_ID, callback);

    expect(first).toEqual({ handled: true, transactionId: id, outcome: 'succeeded' });
    expect(second).toEqual({ handled: true, transactionId: id, outcome: 'duplicate' });

    // Exactly one vend authorization happened — the mock adapter's own
    // quantity only decrements once per real authorizeVend() call.
    const slots = await adapter.getSlots(machineId);
    expect(slots.find((s) => s.slotCode === 'A01')?.quantity).toBe(4); // 5 seeded, minus exactly one authorization
  });

  it('treats two concurrent deliveries of the same callback as exactly one authorization', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const { service, id } = await initiatePayment(adapter, gateway, machineId);

    const callback = {
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'mr-1',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 350,
      mpesaReceiptNumber: 'RECEIPT1',
    };
    const [a, b] = await Promise.all([service.handleMpesaCallback(BUSINESS_ID, callback), service.handleMpesaCallback(BUSINESS_ID, callback)]);

    const outcomes = [a, b].map((r) => (r.handled ? r.outcome : 'unhandled'));
    expect(outcomes).toContain('succeeded');
    expect(outcomes.filter((o) => o === 'succeeded')).toHaveLength(1);

    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('vend_authorized');
  });

  it('escalates to manual_review, never a fabricated match, when the confirmed amount disagrees with the transaction', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const { service, id } = await initiatePayment(adapter, gateway, machineId);

    const outcome = await service.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'mr-1',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 999, // does not match the 350 this transaction was created for
      mpesaReceiptNumber: 'RECEIPT1',
    });

    expect(outcome).toEqual({ handled: true, transactionId: id, outcome: 'amount_mismatch' });
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('manual_review');
    expect(transaction?.paymentRef).toBeNull(); // never marked verified on a mismatch
  });
});

describe('reconcileStuckTransactions', () => {
  it('moves a transaction stuck in paid past the threshold to manual_review', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter, gateway);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'RECEIPT-STUCK');
    // Backdate updatedAt past the threshold — the machine "went offline" right after payment, before ever authorizing.
    await adminFirestore.collection('machineTransactions').doc(id).update({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) });

    const result = await service.reconcileStuckTransactions(BUSINESS_ID, 15 * 60 * 1000);

    expect(result.movedToManualReview).toBe(1);
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('manual_review');
  });

  it('leaves a fresh paid transaction alone', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter, gateway);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'RECEIPT-FRESH');

    const result = await service.reconcileStuckTransactions(BUSINESS_ID, 15 * 60 * 1000);

    expect(result.movedToManualReview).toBe(0);
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('paid');
  });

  it('a late device report can still resolve a transaction the sweep already sent to manual_review', async () => {
    const adapter = new MockVendingAdapter();
    const gateway = new FakePaymentGateway();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter, gateway);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'RECEIPT-LATE');
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, id);
    await adminFirestore.collection('machineTransactions').doc(id).update({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) });

    await service.reconcileStuckTransactions(BUSINESS_ID, 15 * 60 * 1000);
    expect((await service.findById(BUSINESS_ID, id))?.status).toBe('manual_review');

    const applied = await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: true, idempotencyKey: `late-${id}` },
      source: 'mock',
      actor: 'staff-1',
    });

    expect(applied.applied).toBe(true);
    expect((await service.findById(BUSINESS_ID, id))?.status).toBe('dispensed');
  });
});

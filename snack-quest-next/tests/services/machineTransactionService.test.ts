import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository, IllegalTransactionTransitionError } from '@/repositories/machineTransactionRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';

/**
 * The financial core (§ CORE ENTITIES 3, § financial correctness,
 * § idempotency). Every test here is built to fail loudly if a
 * machine's own claim is ever trusted as proof of payment, or if a
 * duplicate device report is ever applied twice.
 */

const BUSINESS_ID = 'biz-vending-txn-test';

async function seedMachineWithSlot(adapter: MockVendingAdapter, quantity = 3) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test-model',
    actor: 'staff-1',
  });
  // The physical/mock slot has to exist on the "hardware" side before
  // configureSlot's own adapter.setPrice() call can address it — same
  // order a real machine would need (slot physically present, then
  // Snack Quest configures what it sells and for how much).
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
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'machineTelemetryEvents', 'deviceCredentials', 'restockTasks']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('createPending', () => {
  it('creates a pending transaction at the slot price', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);

    const { id, transactionRef } = await service.createPending({
      businessId: BUSINESS_ID,
      machineId,
      slotId: 'A01',
      paymentMethod: 'mpesa',
    });

    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('pending');
    expect(transaction?.amountKes).toBe(350);
    expect(transaction?.paymentRef).toBeNull();
    expect(transactionRef).toMatch(/^TXN-/);
  });

  it('refuses a slot with no stock', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, 0);
    const service = new MachineTransactionService(() => adapter);

    await expect(
      service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' }),
    ).rejects.toThrow('out of stock');
  });

  it('refuses a disabled slot', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const slots = new MachineSlotService(() => adapter);
    await slots.setEnabled(BUSINESS_ID, machineId, 'A01', false);
    const service = new MachineTransactionService(() => adapter);

    await expect(
      service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' }),
    ).rejects.toThrow('disabled');
  });
});

describe('the payment/vend state machine', () => {
  it('cannot skip straight from pending to dispensed', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });

    await expect(machineTransactionRepository.moveStatus(BUSINESS_ID, id, 'dispensed')).rejects.toThrow(
      IllegalTransactionTransitionError,
    );
  });

  /*
   * The single most important behaviour in this file: a device
   * payload claiming success must never, by itself, be able to move
   * a transaction that has not been marked paid by the server.
   */
  it('a raw device vend-result payload cannot create a completed financial transaction without server-verified payment', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });

    // No markPaymentVerified call. The transaction is still `pending`.
    // A device reporting a vend result for a vendRef nobody
    // authorized cannot be applied — there is no vendRef to match.
    const result = await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef: 'vend-that-was-never-authorized', dispensed: true, idempotencyKey: 'attack-1' },
      source: 'mock',
      actor: 'device',
    });

    expect(result.applied).toBe(false);
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('pending');
  });

  it('moves pending -> paid only through markPaymentVerified, recording the payment reference', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });

    await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-RECEIPT-1');

    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('paid');
    expect(transaction?.paymentRef).toBe('MPESA-RECEIPT-1');
    expect(transaction?.paidAt).not.toBeNull();
  });

  it('authorizeVend calls the adapter and records a vendRef, only once paid', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-RECEIPT-1');

    const { authorized, vendRef } = await service.authorizeVend(BUSINESS_ID, id);

    expect(authorized).toBe(true);
    expect(vendRef).toBeTruthy();
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('vend_authorized');
    expect(transaction?.vendRef).toBe(vendRef);
  });

  it('refuses to authorize a transaction that has not been paid', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });

    await expect(service.authorizeVend(BUSINESS_ID, id)).rejects.toThrow(IllegalTransactionTransitionError);
  });

  it('moves straight to paid_vend_failed when the adapter refuses authorization (e.g. offline)', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    adapter.setOffline(machineId);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-RECEIPT-1');

    const { authorized } = await service.authorizeVend(BUSINESS_ID, id);

    expect(authorized).toBe(false);
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('paid_vend_failed');
    expect(transaction?.failureReason).toBe('machine offline');
  });
});

describe('applyVendResult — the device path', () => {
  async function paidAndAuthorized(adapter: MockVendingAdapter) {
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-RECEIPT-1');
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, id);
    return { service, machineId, id, vendRef };
  }

  it('a successful dispense moves the transaction to dispensed and records a sale movement', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, id, vendRef } = await paidAndAuthorized(adapter);

    const result = await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: true, idempotencyKey: `result-${vendRef}` },
      source: 'mock',
      actor: 'device',
    });

    expect(result.applied).toBe(true);
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('dispensed');
    expect(transaction?.dispensedAt).not.toBeNull();

    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    expect(movements.some((m) => m.data.reason === 'sale' && m.data.sourceTransactionId === id)).toBe(true);
  });

  it('a failed dispense moves the transaction to paid_vend_failed and records no sale movement', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, id, vendRef } = await paidAndAuthorized(adapter);

    await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: false, failureReason: 'jammed', idempotencyKey: `result-${vendRef}` },
      source: 'mock',
      actor: 'device',
    });

    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('paid_vend_failed');
    expect(transaction?.failureReason).toBe('jammed');

    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    expect(movements.some((m) => m.data.reason === 'sale')).toBe(false);
  });

  /*
   * The granular `DispenseResultStatus` vocabulary (§ DISPENSE
   * RESULT) — every named device-reported failure lands on
   * `paid_vend_failed` exactly like the plain boolean case above did,
   * with the specific reason now preserved as a real, typed field
   * rather than only inside the free-text `failureReason` string.
   */
  it.each(['jam', 'no_product', 'sensor_failure', 'machine_offline', 'failed', 'timeout'] as const)(
    'a "%s" dispense report moves the transaction to paid_vend_failed with dispenseFailureStatus set, and records no sale movement',
    async (status) => {
      const adapter = new MockVendingAdapter();
      const { service, machineId, id, vendRef } = await paidAndAuthorized(adapter);

      await service.applyVendResult({
        businessId: BUSINESS_ID,
        machineId,
        rawPayload: { vendRef, dispensed: false, status, failureReason: `reported ${status}`, idempotencyKey: `result-${vendRef}` },
        source: 'mock',
        actor: 'device',
      });

      const transaction = await service.findById(BUSINESS_ID, id);
      expect(transaction?.status).toBe('paid_vend_failed');
      expect(transaction?.dispenseFailureStatus).toBe(status);
      expect(transaction?.failureReason).toBe(`reported ${status}`);

      const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
      expect(movements.some((m) => m.data.reason === 'sale')).toBe(false);
    },
  );

  it('an "unknown" dispense report moves the transaction to manual_review, never paid_vend_failed, and never touches inventory', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, id, vendRef } = await paidAndAuthorized(adapter);

    const result = await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: false, status: 'unknown', failureReason: 'controller did not confirm', idempotencyKey: `result-${vendRef}` },
      source: 'mock',
      actor: 'device',
    });

    expect(result.applied).toBe(true);
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('manual_review');
    expect(transaction?.dispenseFailureStatus).toBe('unknown');

    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    expect(movements.some((m) => m.data.reason === 'sale')).toBe(false);
  });

  it('rejects a payload whose dispensed boolean disagrees with its own status, rather than silently picking one', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, vendRef } = await paidAndAuthorized(adapter);

    await expect(
      service.applyVendResult({
        businessId: BUSINESS_ID,
        machineId,
        rawPayload: { vendRef, dispensed: true, status: 'jam', idempotencyKey: `result-${vendRef}` },
        source: 'mock',
        actor: 'device',
      }),
    ).rejects.toBeInstanceOf(UnrecognisedHardwarePayloadError);
  });

  /* The single test that proves the idempotency requirement, not just asserts it. */
  it('applying the exact same vend-result report twice creates exactly one sale, not two', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, id, vendRef } = await paidAndAuthorized(adapter);
    const payload = { vendRef, dispensed: true, idempotencyKey: `result-${vendRef}` };

    const first = await service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'mock', actor: 'device' });
    const second = await service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'mock', actor: 'device' });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);

    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    expect(movements.filter((m) => m.data.reason === 'sale').length).toBe(1);

    // And the transaction did not get moved (or re-moved) a second time.
    const transaction = await service.findById(BUSINESS_ID, id);
    expect(transaction?.status).toBe('dispensed');
  });

  /* A retried report reaching a *different* process/request must still be caught — this exercises the Firestore-level atomicity, not an in-memory guard. */
  it('is idempotent even across two concurrent calls racing on the same report', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, vendRef } = await paidAndAuthorized(adapter);
    const payload = { vendRef, dispensed: true, idempotencyKey: `result-${vendRef}` };

    const [a, b] = await Promise.all([
      service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'mock', actor: 'device' }),
      service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: payload, source: 'mock', actor: 'device' }),
    ]);

    const appliedCount = [a, b].filter((r) => r.applied).length;
    expect(appliedCount).toBe(1);

    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    expect(movements.filter((m) => m.data.reason === 'sale').length).toBe(1);
  });

  it('a malformed payload throws rather than being silently accepted', async () => {
    const adapter = new MockVendingAdapter();
    const { service, machineId } = await paidAndAuthorized(adapter);

    await expect(
      service.applyVendResult({
        businessId: BUSINESS_ID,
        machineId,
        rawPayload: { dispensed: 'yes, probably' },
        source: 'mock',
        actor: 'device',
      }),
    ).rejects.toThrow(UnrecognisedHardwarePayloadError);
  });

  it('a vend result for an unknown vendRef is recorded but marks the telemetry event failed rather than applying anything', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    const service = new MachineTransactionService(() => adapter);

    const result = await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef: 'ghost-vend-ref', dispensed: true, idempotencyKey: 'idem-ghost' },
      source: 'mock',
      actor: 'device',
    });

    expect(result.applied).toBe(false);
    const events = await machineTelemetryEventRepository.listByMachine(BUSINESS_ID, machineId);
    expect(events.some((e) => e.data.processingError?.includes('ghost-vend-ref'))).toBe(true);
  });
});

describe('refund path', () => {
  it('moves paid_vend_failed -> refund_requested -> refunded', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter);
    adapter.setOffline(machineId);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-RECEIPT-1');
    await service.authorizeVend(BUSINESS_ID, id); // fails: machine offline -> paid_vend_failed

    await service.requestRefund(BUSINESS_ID, id);
    expect((await service.findById(BUSINESS_ID, id))?.status).toBe('refund_requested');

    await service.markRefunded(BUSINESS_ID, id);
    expect((await service.findById(BUSINESS_ID, id))?.status).toBe('refunded');
  });

  it('cannot be refunded from dispensed — a successful vend has nothing to refund', async () => {
    const adapter = new MockVendingAdapter();
    const { service, id } = await (async () => {
      const s = new MachineTransactionService(() => adapter);
      const { machineId } = await seedMachineWithSlot(adapter);
      const { id: txnId } = await s.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await s.markPaymentVerified(BUSINESS_ID, txnId, 'MPESA-RECEIPT-1');
      const { vendRef } = await s.authorizeVend(BUSINESS_ID, txnId);
      await s.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `r-${vendRef}` }, source: 'mock', actor: 'device' });
      return { service: s, id: txnId };
    })();

    await expect(service.requestRefund(BUSINESS_ID, id)).rejects.toThrow(IllegalTransactionTransitionError);
  });
});

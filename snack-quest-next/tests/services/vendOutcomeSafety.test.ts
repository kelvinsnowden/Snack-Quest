import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { MachineSlotService } from '@/services/machineSlotService';
import { vendingSaleReviewService, SaleReviewError } from '@/services/vendingSaleReviewService';
import { MachineTransactionService, IdempotencyKeyReusedError } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineEventRepository } from '@/repositories/machineEventRepository';
import { machineInventoryMovementService } from '@/services/machineInventoryMovementService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import type { VendResultReport } from '@/lib/vending/hardwareAdapter';
import { clearIntegrationCollections, provisionMachine } from '../helpers/integrationFixtures';

/**
 * Adversarial tests for the money/stock side of a vend outcome
 * (`MachineTransactionService.applyVendReport`). Each one is a way the
 * real world breaks the happy path: concurrency, crashes, duplicate and
 * contradicting reports, reports that arrive after the money moved.
 * Every test asserts money state AND stock.
 */

const BUSINESS_ID = 'biz-vend-outcome-safety';
let adapter: MockVendingAdapter;
let service: MachineTransactionService;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  adapter = new MockVendingAdapter();
  service = new MachineTransactionService(() => adapter);
});

async function authorizedSale(quantity = 3) {
  const { machineId } = await provisionMachine(BUSINESS_ID);
  adapter.seedSlot(machineId, 'A01', { quantity });
  await new MachineSlotService(() => adapter).configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 300, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-1');
  const { vendRef } = await service.authorizeVend(BUSINESS_ID, id);
  return { machineId, transactionId: id, vendRef: vendRef! };
}

const report = (vendRef: string, status: VendResultReport['status'], key: string): VendResultReport => ({
  vendRef,
  dispensed: status === 'success',
  status,
  failureReason: status === 'success' ? null : status,
  deviceTimestamp: null,
  idempotencyKey: key,
});

async function apply(machineId: string, r: VendResultReport, source = 'test') {
  return service.applyVendReport({ businessId: BUSINESS_ID, machineId, report: r, rawPayload: { ...r }, source, actor: 'machine' });
}

async function state(transactionId: string, machineId: string) {
  const transaction = await machineTransactionRepository.findById(BUSINESS_ID, transactionId);
  const slot = (await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).get()).data();
  const sales = (await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01')).filter((m) => m.data.reason === 'sale');
  return { status: transaction?.status, conflict: transaction?.outcomeConflict ?? null, quantity: slot?.currentQuantity as number, sales: sales.length };
}

describe('duplicates and concurrency', () => {
  it('the same success via two channels (API + webhook) completes one sale and moves stock once', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    const first = await apply(machineId, report(vendRef, 'success', 'v1:evt-1'), 'v1_api');
    const second = await apply(machineId, report(vendRef, 'success', 'webhook:mfr:evt-9'), 'webhook');
    expect(first.result).toBe('applied');
    expect(second.result).toBe('already_recorded');
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'dispensed', quantity: 2, sales: 1 });
  });

  it('ten concurrent identical reports: exactly one applies, stock moves once', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    const results = await Promise.all(Array.from({ length: 10 }, () => apply(machineId, report(vendRef, 'success', 'v1:same'))));
    expect(results.filter((r) => r.applied).length).toBe(1);
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'dispensed', quantity: 2, sales: 1 });
  }, 60_000);

  it('concurrent success and failure (different keys): one wins, the other is a recorded conflict — never both applied, never an error', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    const [a, b] = await Promise.all([apply(machineId, report(vendRef, 'success', 'k-success')), apply(machineId, report(vendRef, 'jam', 'k-jam'))]);
    const results = [a.result, b.result].sort();
    expect(results.filter((r) => r === 'applied').length).toBe(1);
    const final = await state(transactionId, machineId);
    if (final.status === 'dispensed') {
      expect(final.sales).toBe(1);
    } else {
      // Failure won first; the success that followed is a conflict parked for review with the stock recorded.
      expect(final.status).toBe('manual_review');
      expect(final.sales).toBe(1);
      expect(final.conflict?.reportedStatus).toBe('success');
    }
  }, 60_000);
});

describe('crash safety', () => {
  it('a crash after the sale was recorded but before stock moved is repaired by the retry', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    const spy = vi.spyOn(machineInventoryMovementService, 'recordMovement').mockRejectedValueOnce(new Error('instance killed'));
    await expect(apply(machineId, report(vendRef, 'success', 'v1:crash-1'))).rejects.toThrow('instance killed');
    spy.mockRestore();
    expect((await state(transactionId, machineId)).quantity).toBe(3);

    const retry = await apply(machineId, report(vendRef, 'success', 'v1:crash-1'));
    expect(retry.result).toBe('duplicate');
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'dispensed', quantity: 2, sales: 1 });
    // …and a third delivery is a clean no-op.
    expect((await apply(machineId, report(vendRef, 'success', 'v1:crash-1'))).result).toBe('duplicate');
    expect((await state(transactionId, machineId)).sales).toBe(1);
  });
});

describe('idempotency key misuse', () => {
  it('the same key with a different outcome is refused, not silently ignored', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'failed', 'v1:reused'));
    await expect(apply(machineId, report(vendRef, 'success', 'v1:reused'))).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'paid_vend_failed', quantity: 3, sales: 0 });
  });
});

describe('late and contradicting outcomes', () => {
  it('success after the refund decision: stock recorded, refund parked in review, conflict alerted', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'failed', 'first'));
    expect((await state(transactionId, machineId)).status).toBe('paid_vend_failed');

    const late = await apply(machineId, report(vendRef, 'success', 'late'));
    expect(late.result).toBe('conflict');
    const final = await state(transactionId, machineId);
    expect(final).toMatchObject({ status: 'manual_review', quantity: 2, sales: 1 });
    expect(final.conflict).toMatchObject({ reportedStatus: 'success', previousStatus: 'paid_vend_failed', resolved: false });
    const conflicts = (await machineEventRepository.listByMachine(BUSINESS_ID, machineId)).filter(({ data }) => data.type === 'DISPENSE_OUTCOME_CONFLICT');
    expect(conflicts.length).toBe(1);
  });

  it('success after the customer was refunded: money untouched, stock recorded, conflict flagged', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'failed', 'first'));
    await service.requestRefund(BUSINESS_ID, transactionId);
    await service.markRefunded(BUSINESS_ID, transactionId);
    const late = await apply(machineId, report(vendRef, 'success', 'late'));
    expect(late.result).toBe('conflict');
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'refunded', quantity: 2, sales: 1 });
    expect((await state(transactionId, machineId)).conflict?.previousStatus).toBe('refunded');
  });

  it('failure after a completed sale never refunds and never moves stock again', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'success', 'first'));
    const late = await apply(machineId, report(vendRef, 'jam', 'late'));
    expect(late.result).toBe('conflict');
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'dispensed', quantity: 2, sales: 1 });
  });

  it('an outcome for a vend Snack Quest never dispatched is recorded as unrecognised and changes nothing', async () => {
    const { machineId, transactionId } = await authorizedSale();
    const result = await apply(machineId, report('DSP-FFFFFFFF', 'success', 'ghost'));
    expect(result.result).toBe('unknown_vend');
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'vend_authorized', quantity: 3, sales: 0 });
    const events = await machineEventRepository.listByMachine(BUSINESS_ID, machineId);
    expect(events.some(({ data }) => data.nativeType === 'UNRECOGNISED_DISPENSE_REPORT')).toBe(true);
  });

  it('a dispense from a slot the ledger says is empty completes the sale and flags an inventory mismatch instead of failing', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale(1);
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 0 });
    const result = await apply(machineId, report(vendRef, 'success', 'empty-ledger'));
    expect(result.result).toBe('applied');
    expect((await state(transactionId, machineId)).status).toBe('dispensed');
    const events = await machineEventRepository.listByMachine(BUSINESS_ID, machineId);
    expect(events.some(({ data }) => data.type === 'INVENTORY_MISMATCH')).toBe(true);
  });
});

describe('closing a conflict nobody could otherwise resolve (V-18)', () => {
  it('failure after a completed sale: listed, closable once with a note, and the sale, money and stock are unchanged', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'success', 'first'));
    await apply(machineId, report(vendRef, 'jam', 'late'));
    expect((await vendingSaleReviewService.listOpenConflicts(BUSINESS_ID)).map((row) => row.id)).toContain(transactionId);
    const detail = await vendingSaleReviewService.getSale(BUSINESS_ID, transactionId);
    expect(detail.actions.find((entry) => entry.action === 'acknowledge_conflict')?.allowed).toBe(true);

    await vendingSaleReviewService.resolve(BUSINESS_ID, transactionId, { action: 'acknowledge_conflict', note: 'Slot count matches one sale' }, 'staff-9');

    const after = await state(transactionId, machineId);
    expect(after).toMatchObject({ status: 'dispensed', quantity: 2, sales: 1 });
    expect(after.conflict).toMatchObject({ resolved: true, resolvedBy: 'staff-9', resolutionNote: 'Slot count matches one sale' });
    expect(await vendingSaleReviewService.listOpenConflicts(BUSINESS_ID)).toHaveLength(0);
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, transactionId, { action: 'acknowledge_conflict', note: 'again' }, 'staff-9')).rejects.toBeInstanceOf(SaleReviewError);
  });

  it('success after the customer was refunded can be closed; the refund stands', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'failed', 'first'));
    await service.requestRefund(BUSINESS_ID, transactionId);
    await service.markRefunded(BUSINESS_ID, transactionId);
    await apply(machineId, report(vendRef, 'success', 'late'));
    await vendingSaleReviewService.resolve(BUSINESS_ID, transactionId, { action: 'acknowledge_conflict', note: 'Customer has both; written off' }, 'staff-9');
    expect(await state(transactionId, machineId)).toMatchObject({ status: 'refunded', conflict: expect.objectContaining({ resolved: true }) });
  });

  it('a sale without a conflict, or one under review, cannot be closed this way', async () => {
    const { machineId, transactionId, vendRef } = await authorizedSale();
    await apply(machineId, report(vendRef, 'success', 'first'));
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, transactionId, { action: 'acknowledge_conflict', note: 'nothing to close' }, 'staff-9')).rejects.toBeInstanceOf(SaleReviewError);
  });
});

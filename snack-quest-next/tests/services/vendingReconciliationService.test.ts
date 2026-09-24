import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { vendingReconciliationService } from '@/services/vendingReconciliationService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * § PART 4 — CENTRAL PAYMENT RECONCILIATION. Proves the two real
 * signals this service surfaces (see its own doc comment for exactly
 * why these two and not the full brief-named list): the manual-review
 * backlog, and a device vend report that matched no transaction at
 * all.
 */

const BUSINESS_ID = 'biz-reconciliation-test';

async function cleanCollections() {
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineTelemetryEvents', 'deviceCredentials']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionMachineWithSlot(adapter: MockVendingAdapter, quantity = 5) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-RECON-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 300, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId };
}

describe('VendingReconciliationService.getReconciliationIssues', () => {
  it('surfaces a transaction that reached manual_review from an explicit UNKNOWN device report', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionMachineWithSlot(adapter);
    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: false, status: 'unknown', idempotencyKey: `vend-result-${id}` },
      source: 'mock',
      actor: 'staff-1',
    });

    const summary = await vendingReconciliationService.getReconciliationIssues(BUSINESS_ID);
    expect(summary.manualReviewTransactions).toHaveLength(1);
    expect(summary.manualReviewTransactions[0]).toMatchObject({ transactionId: id, machineId, status: 'manual_review' });
    expect(summary.unmatchedVendReports).toHaveLength(0);
  });

  it('surfaces a device vend report that matched no transaction at all', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionMachineWithSlot(adapter);
    const transactions = new MachineTransactionService(() => adapter);

    await transactions.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef: 'vend-ref-that-was-never-issued', dispensed: true, idempotencyKey: 'stray-report-1' },
      source: 'mock',
      actor: 'staff-1',
    });

    const summary = await vendingReconciliationService.getReconciliationIssues(BUSINESS_ID);
    expect(summary.unmatchedVendReports).toHaveLength(1);
    expect(summary.unmatchedVendReports[0].machineId).toBe(machineId);
    expect(summary.unmatchedVendReports[0].processingError).toContain('vend-ref-that-was-never-issued');
    expect(summary.manualReviewTransactions).toHaveLength(0);
  });

  it('never surfaces a transaction that completed cleanly', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionMachineWithSlot(adapter);
    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });

    const summary = await vendingReconciliationService.getReconciliationIssues(BUSINESS_ID);
    expect(summary.manualReviewTransactions).toHaveLength(0);
    expect(summary.unmatchedVendReports).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { deepReconciliationService } from '@/services/deepReconciliationService';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { clearIntegrationCollections, provisionMachine } from '../helpers/integrationFixtures';

const BUSINESS_ID = 'biz-deep-reconciliation';
let adapter: MockVendingAdapter;
let service: MachineTransactionService;
let machineId: string;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  const alerts = await adminFirestore.collection('alerts').where('businessId', '==', BUSINESS_ID).get();
  await Promise.all(alerts.docs.map((doc) => doc.ref.delete()));
  adapter = new MockVendingAdapter();
  service = new MachineTransactionService(() => adapter);
  ({ machineId } = await provisionMachine(BUSINESS_ID));
  adapter.seedSlot(machineId, 'A01', { quantity: 5 });
  await new MachineSlotService(() => adapter).configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 200, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
});

async function sale(outcome: 'success' | 'failed') {
  const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await service.markPaymentVerified(BUSINESS_ID, id, `R-${id.slice(0, 4)}`);
  const { vendRef } = await service.authorizeVend(BUSINESS_ID, id);
  await service.applyVendReport({ businessId: BUSINESS_ID, machineId, report: { vendRef: vendRef!, dispensed: outcome === 'success', status: outcome, failureReason: null, deviceTimestamp: null, idempotencyKey: `k-${id}` }, rawPayload: {}, source: 'test', actor: 'm' });
  return id;
}

const kinds = async () => (await deepReconciliationService.run(BUSINESS_ID)).discrepancies.map((d) => d.kind).sort();

describe('deep reconciliation', () => {
  it('a clean ledger reports nothing', async () => {
    await sale('success');
    await sale('failed');
    expect(await kinds()).toEqual([]);
  });

  it('detects a completed sale whose stock movement is missing', async () => {
    await sale('success');
    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    await Promise.all(movements.filter((m) => m.data.reason === 'sale').map((m) => adminFirestore.collection('machineInventoryMovements').doc(m.id).delete()));
    expect(await kinds()).toEqual(['dispensed_without_stock_movement']);
  });

  it('detects a refund owed for more than a day, and alerts once however often it runs', async () => {
    const id = await sale('failed');
    await adminFirestore.collection('machineTransactions').doc(id).update({ updatedAt: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 3_600_000)) });
    expect(await kinds()).toEqual(['refund_owed_too_long']);
    await deepReconciliationService.run(BUSINESS_ID);
    const alerts = await adminFirestore.collection('alerts').where('businessId', '==', BUSINESS_ID).get();
    expect(alerts.size).toBe(1);
  });

  it('also flags a refund decided but never sent', async () => {
    const id = await sale('failed');
    await adminFirestore.collection('machineTransactions').doc(id).update({ status: 'refund_requested', updatedAt: Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 3_600_000)) });
    expect(await kinds()).toEqual(['refund_owed_too_long']);
  });

  it('flags an unresolved outcome conflict until someone resolves it', async () => {
    const id = await sale('failed');
    const { vendRef } = (await adminFirestore.collection('machineTransactions').doc(id).get()).data() as { vendRef: string };
    await service.applyVendReport({ businessId: BUSINESS_ID, machineId, report: { vendRef, dispensed: true, status: 'success', failureReason: null, deviceTimestamp: null, idempotencyKey: 'late' }, rawPayload: {}, source: 'test', actor: 'm' });
    expect(await kinds()).toContain('unresolved_outcome_conflict');
    expect(await kinds()).not.toContain('stock_moved_without_dispensed_sale');
  });
});

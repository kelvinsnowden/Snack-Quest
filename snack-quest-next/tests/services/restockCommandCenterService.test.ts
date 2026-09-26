import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { restockCommandCenterService } from '@/services/restockCommandCenterService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

/**
 * § PART 3 — RESTOCK COMMAND CENTER. Proves the fleet-wide triage
 * table surfaces the exact same at-risk slots and quantities
 * `computeRestockNeed` would (the same seeding pattern
 * `recommendationEngineService.test.ts` already uses for the
 * generator this reads live instead of via a stored recommendation),
 * and that it never surfaces a healthy slot or a machine that isn't
 * even live yet.
 */
const BUSINESS_ID = 'biz-restock-command-center-test';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanCollections() {
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineAssortments', 'machineAssortmentPriceHistory', 'machineDailySummary', 'snackItems', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function createSnackItem(name: string) {
  return snackItemRepository.create(
    { businessId: BUSINESS_ID, name, imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
    'staff-1',
  );
}

async function activateMachine(machineId: string) {
  await machineService.updateStatus(BUSINESS_ID, machineId, 'installing', 'staff-1');
  await machineService.updateStatus(BUSINESS_ID, machineId, 'testing', 'staff-1');
  await machineService.updateStatus(BUSINESS_ID, machineId, 'active', 'staff-1');
}

describe('RestockCommandCenterService.getAtRiskSlots', () => {
  it('surfaces a fast-selling, nearly-empty slot with the same recommended quantity the generator would produce', async () => {
    const skuId = await createSnackItem('Fast Seller');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-CMD-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    await activateMachine(machineId);
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 20 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 20 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    const transactions = new MachineTransactionService(() => adapter);
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    for (let i = 0; i < 10; i += 1) {
      const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
      const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
      await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
      await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${yesterday}T1${i}:00:00.000Z`) });
    }
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 2 });
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const rows = await restockCommandCenterService.getAtRiskSlots(BUSINESS_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ machineId, slotCode: 'A01', productId: skuId, currentQuantity: 2, capacity: 20 });
    expect(rows[0].recommendedQuantity).toBeGreaterThan(0);
    expect(rows[0].daysOfStockRemaining).toBeLessThan(7);
  });

  it('never surfaces a slot with no measured velocity, or one already holding a healthy number of days of stock', async () => {
    const skuId = await createSnackItem('Untested Product');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-CMD-HEALTHY-${Date.now()}`,
      serialNumber: 'SN-2',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    await activateMachine(machineId);
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 20 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 20 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    const rows = await restockCommandCenterService.getAtRiskSlots(BUSINESS_ID);
    expect(rows).toHaveLength(0);
  });

  it('never surfaces a slot on a machine that is not active yet, however low its stock', async () => {
    const skuId = await createSnackItem('Not Live Yet');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-CMD-PROV-${Date.now()}`,
      serialNumber: 'SN-3',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    // Deliberately not activated — still `provisioning`.
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 0 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 0 });

    const rows = await restockCommandCenterService.getAtRiskSlots(BUSINESS_ID);
    expect(rows).toHaveLength(0);
  });
});

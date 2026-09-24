import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { IllegalRecommendationTransitionError, RecommendationNotFoundError, RecommendationNotApprovedError } from '@/repositories/intelligenceRecommendationRepository';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

const BUSINESS_ID = 'biz-recommendation-engine-test';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanCollections() {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineAssortments',
    'machineAssortmentPriceHistory',
    'machineDailySummary',
    'snackItems',
    'deviceCredentials',
    'intelligenceRecommendations',
  ]) {
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

describe('RecommendationEngineService.generateRestockRecommendations', () => {
  it('recommends a real quantity for a fast-selling, nearly-empty slot, and never twice for the same slot', async () => {
    const skuId = await createSnackItem('Fast Seller');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-RESTOCK-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 20 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 20 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    // Sell 10 units yesterday (velocity 10/day over the 14-day window), leaving 2 on hand — well under the 7-day target.
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

    const created = await recommendationEngineService.generateRestockRecommendations(BUSINESS_ID, machineId, 'staff-1');
    expect(created).toHaveLength(1);
    const recommendation = await recommendationEngineService.findById(BUSINESS_ID, created[0]);
    expect(recommendation?.type).toBe('RESTOCK');
    expect(recommendation?.status).toBe('pending');
    expect(recommendation?.target).toEqual({ kind: 'machine', id: machineId });
    expect(Number(recommendation?.supportingMetrics.recommendedQuantity)).toBeGreaterThan(0);

    // Running it again must not create a duplicate pending recommendation for the same slot.
    const secondRun = await recommendationEngineService.generateRestockRecommendations(BUSINESS_ID, machineId, 'staff-1');
    expect(secondRun).toHaveLength(0);
  });

  it('recommends nothing for a slot with no measured velocity', async () => {
    const skuId = await createSnackItem('Untested Product');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-NOVEL-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 1 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    const created = await recommendationEngineService.generateRestockRecommendations(BUSINESS_ID, machineId, 'staff-1');
    expect(created).toHaveLength(0);
  });
});

describe('RecommendationEngineService.generateDeadStockRecommendations', () => {
  it('recommends REMOVE_PRODUCT for a slot with zero sales while still carrying stock', async () => {
    const skuId = await createSnackItem('Dead Product');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-DEAD-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const created = await recommendationEngineService.generateDeadStockRecommendations(BUSINESS_ID, machineId, 'staff-1');
    expect(created).toHaveLength(1);
    const recommendation = await recommendationEngineService.findById(BUSINESS_ID, created[0]);
    expect(recommendation?.type).toBe('REMOVE_PRODUCT');
  });
});

describe('RecommendationEngineService status lifecycle', () => {
  it('approve/dismiss records who acted and why, and refuses a second transition', async () => {
    const skuId = await createSnackItem('Lifecycle Product');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-LIFECYCLE-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const [recommendationId] = await recommendationEngineService.generateDeadStockRecommendations(BUSINESS_ID, machineId, 'staff-1');
    await recommendationEngineService.approve(BUSINESS_ID, recommendationId, 'Removed from assortment', 'staff-2');

    const recommendation = await recommendationEngineService.findById(BUSINESS_ID, recommendationId);
    expect(recommendation?.status).toBe('approved');
    expect(recommendation?.actionTaken).toBe('Removed from assortment');
    expect(recommendation?.actionedBy).toBe('staff-2');

    await expect(recommendationEngineService.dismiss(BUSINESS_ID, recommendationId, 'changed my mind', 'staff-2')).rejects.toThrow(IllegalRecommendationTransitionError);
  });

  it('records an outcome only once approved, and refuses one on a still-pending recommendation', async () => {
    const skuId = await createSnackItem('Outcome Product');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-OUTCOME-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const [recommendationId] = await recommendationEngineService.generateDeadStockRecommendations(BUSINESS_ID, machineId, 'staff-1');

    await expect(recommendationEngineService.recordOutcome(BUSINESS_ID, recommendationId, 'sales increased', {}, 'staff-2')).rejects.toThrow(RecommendationNotApprovedError);

    await recommendationEngineService.approve(BUSINESS_ID, recommendationId, 'Removed from assortment', 'staff-2');
    await recommendationEngineService.recordOutcome(BUSINESS_ID, recommendationId, 'Assortment turnover improved 12% at this machine', { turnoverChangePct: 12 }, 'staff-2');

    const recommendation = await recommendationEngineService.findById(BUSINESS_ID, recommendationId);
    expect(recommendation?.outcome).toBe('Assortment turnover improved 12% at this machine');
    expect(recommendation?.outcomeMetrics).toEqual({ turnoverChangePct: 12 });
  });

  it('throws RecommendationNotFoundError for a recommendation belonging to a different business', async () => {
    const skuId = await createSnackItem('Isolation Product');
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-ISO-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const [recommendationId] = await recommendationEngineService.generateDeadStockRecommendations(BUSINESS_ID, machineId, 'staff-1');
    await expect(recommendationEngineService.approve('some-other-business', recommendationId, 'x', 'staff-2')).rejects.toThrow(RecommendationNotFoundError);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { MachineTelemetryService } from '@/services/machineTelemetryService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineAssortmentIntelligenceService } from '@/services/machineAssortmentIntelligenceService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';
import { MachineNotFoundError } from '@/repositories/machineRepository';

const BUSINESS_ID = 'biz-assortment-intel-test';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanCollections() {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineAssortments',
    'machineAssortmentPriceHistory',
    'machineDailySummary',
    'machineTelemetryEvents',
    'snackItems',
    'deviceCredentials',
  ]) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function createSnackItem(name: string, costKes: number) {
  return snackItemRepository.create(
    { businessId: BUSINESS_ID, name, imageUrl: null, expectedUnitCostKes: costKes, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
    'staff-1',
  );
}

describe('MachineAssortmentIntelligenceService.classifyMachineCatalogLayers', () => {
  it('distinguishes global catalog, assortment, stocked and sellable — exactly the four layers the brief names', async () => {
    const skuAssortedStocked = await createSnackItem('Assorted And Stocked', 100);
    const skuAssortedEmpty = await createSnackItem('Assorted But Empty', 100);
    await createSnackItem('Never Assorted To This Machine', 100); // exists globally, never touches this machine

    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-LAYERS-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);

    adapter.seedSlot(machineId, 'A01', { quantity: 5 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuAssortedStocked, productCatalogue: 'snackItem', priceKes: 200, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuAssortedStocked, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuAssortedStocked, 'A01');

    adapter.seedSlot(machineId, 'A02', { quantity: 0 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A02', productId: skuAssortedEmpty, productCatalogue: 'snackItem', priceKes: 200, capacity: 10, position: 2 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A02`).update({ currentQuantity: 0 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuAssortedEmpty, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuAssortedEmpty, 'A02');

    const layers = await machineAssortmentIntelligenceService.classifyMachineCatalogLayers(BUSINESS_ID, machineId);
    expect(layers.globalCatalogCount).toBe(3); // never interprets the un-assorted global product as a machine stockout
    expect(layers.assortmentCount).toBe(2);
    expect(layers.stockedCount).toBe(1);
    // getSellableCatalog also requires machine.status === 'active' — this machine is still 'provisioning', so nothing is sellable yet even though one slot is stocked.
    expect(layers.sellableCount).toBe(0);
  });

  it('throws MachineNotFoundError for a machine that does not exist', async () => {
    await expect(machineAssortmentIntelligenceService.classifyMachineCatalogLayers(BUSINESS_ID, 'ghost')).rejects.toThrow(MachineNotFoundError);
  });
});

describe('MachineAssortmentIntelligenceService.getAssortmentPerformance', () => {
  it('flags a dead slot (assorted, zero sales in the window) distinctly from a stocked-out one', async () => {
    const skuDead = await createSnackItem('Dead Slot Snack', 100);
    const skuLive = await createSnackItem('Live Slot Snack', 100);

    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-PERF-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);

    adapter.seedSlot(machineId, 'B01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'B01', productId: skuDead, productCatalogue: 'snackItem', priceKes: 200, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__B01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuDead, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuDead, 'B01');

    adapter.seedSlot(machineId, 'B02', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'B02', productId: skuLive, productCatalogue: 'snackItem', priceKes: 300, capacity: 10, position: 2 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__B02`).update({ currentQuantity: 9 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuLive, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuLive, 'B02');

    // Sell one unit of the "live" slot yesterday, backdated so it lands inside the trailing window.
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'B02', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
    await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${yesterday}T12:00:00.000Z`) });
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const performance = await machineAssortmentIntelligenceService.getAssortmentPerformance(BUSINESS_ID, machineId, 7);
    const deadSlot = performance.slots.find((s) => s.slotCode === 'B01');
    const liveSlot = performance.slots.find((s) => s.slotCode === 'B02');

    expect(deadSlot?.dead).toBe(true);
    expect(deadSlot?.currentlyStockedOut).toBe(false); // still has 10 units on hand — dead, not stocked out
    expect(liveSlot?.dead).toBe(false);
    expect(liveSlot?.unitsSold).toBe(1);
    expect(liveSlot?.revenueKes).toBe(300);
  });

  it('reports insufficient_data when the window has no rolled-up days at all', async () => {
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-NODATA-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const performance = await machineAssortmentIntelligenceService.getAssortmentPerformance(BUSINESS_ID, machineId, 30);
    expect(performance.dataQuality).toBe('insufficient_data');
    expect(performance.slots).toEqual([]);
  });

  it('excludes a genuinely offline day from the velocity denominator — 2 units sold on 1 active day out of a 2-day window is velocity 2/day, not 1/day', async () => {
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Downtime Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-DOWNTIME-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 200, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    const twoDaysAgo = dateKey(new Date(Date.now() - 2 * DAY_MS));
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));

    // Active day: a heartbeat and two real sales.
    const telemetry = new MachineTelemetryService(() => adapter);
    const { eventId } = await telemetry.ingest({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { machineId, eventType: 'heartbeat', idempotencyKey: `hb-${Date.now()}` },
      source: 'test',
    });
    await adminFirestore.collection('machineTelemetryEvents').doc(eventId).update({ receivedAt: new Date(`${twoDaysAgo}T12:00:00.000Z`) });

    const transactions = new MachineTransactionService(() => adapter);
    for (let i = 0; i < 2; i += 1) {
      const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
      const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
      await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
      await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${twoDaysAgo}T1${i}:00:00.000Z`) });
    }
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, twoDaysAgo);

    // Genuinely offline day: no heartbeat, no transaction — explicitly rolled up as all-zero, not just missing.
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const performance = await machineAssortmentIntelligenceService.getAssortmentPerformance(BUSINESS_ID, machineId, 2);
    expect(performance.activeDays).toBe(1);
    const slot = performance.slots.find((s) => s.slotCode === 'A01');
    expect(slot?.unitsSold).toBe(2);
    expect(slot?.velocityPerDay).toBe(2); // 2 units / 1 active day — not 2 units / 2 window days
  });
});

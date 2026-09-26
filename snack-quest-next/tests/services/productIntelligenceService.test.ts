import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { productIntelligenceService } from '@/services/productIntelligenceService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { locationService } from '@/services/locationService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

const BUSINESS_ID = 'biz-product-intel-test';
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
    'locations',
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

async function provisionMachineAtLocation(machineCode: string, locationId: string) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  await machineService.relocate(BUSINESS_ID, machineId, { locationId, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
  return machineId;
}

describe('ProductIntelligenceService.getNetworkProductPerformance', () => {
  it('sums units/revenue/COGS/margin across every carrying machine, and distinguishes stocked vs selling locations', async () => {
    const locationA = await locationService.create({ businessId: BUSINESS_ID, name: 'Uni A', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    const locationB = await locationService.create({ businessId: BUSINESS_ID, name: 'Hotel B', locationType: 'hotel', city: 'Nairobi', actor: 'staff-1' });

    const skuId = await createSnackItem('Cross-Location Snack', 100);
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    const transactions = new MachineTransactionService(() => adapter);

    // Machine at location A: stocked and sells.
    const machineA = await provisionMachineAtLocation(`SQ-A-${Date.now()}`, locationA);
    adapter.seedSlot(machineA, 'A01', { quantity: 5 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: machineA, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineA}__A01`).update({ currentQuantity: 5 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: machineA, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineA, 'snackItem', skuId, 'A01');

    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const { id: txA } = await transactions.createPending({ businessId: BUSINESS_ID, machineId: machineA, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, txA, `mpesa-ref-${txA}`);
    const { vendRef: vendRefA } = await transactions.authorizeVend(BUSINESS_ID, txA);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId: machineA, rawPayload: { vendRef: vendRefA, dispensed: true, idempotencyKey: `vend-result-${txA}` }, source: 'mock', actor: 'staff-1' });
    await adminFirestore.collection('machineTransactions').doc(txA).update({ createdAt: new Date(`${yesterday}T12:00:00.000Z`) });
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineA, yesterday);

    // Machine at location B: stocked but never sells (out of stock all window — no rollup even created, i.e. zero sales).
    const machineB = await provisionMachineAtLocation(`SQ-B-${Date.now()}`, locationB);
    adapter.seedSlot(machineB, 'B01', { quantity: 0 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: machineB, slotCode: 'B01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineB}__B01`).update({ currentQuantity: 0 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: machineB, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineB, 'snackItem', skuId, 'B01');
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineB, yesterday);

    const performance = await productIntelligenceService.getNetworkProductPerformance(BUSINESS_ID, 7);
    const product = performance.find((p) => p.productId === skuId);

    expect(product?.unitsSold).toBe(1);
    expect(product?.revenueKes).toBe(250);
    expect(product?.cogsKes).toBe(100);
    expect(product?.grossProfitKes).toBe(150);
    expect(product?.marginPct).toBe(60);
    expect(product?.category).toBe('Asian Snacks');
    expect(product?.locationsStocked).toBe(2); // assorted+visible at both A and B
    expect(product?.locationsSelling).toBe(1); // only A actually sold it
    expect(product?.stockoutFrequencyPct).toBeGreaterThan(0); // machine B reported this SKU stocked out that day
  });

  it('reports zero margin as null, never a fabricated number, when a product had no revenue', async () => {
    const locationA = await locationService.create({ businessId: BUSINESS_ID, name: 'Uni A', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    const skuId = await createSnackItem('No Sales Snack', 100);
    const machineA = await provisionMachineAtLocation(`SQ-NOSALE-${Date.now()}`, locationA);
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineA, 'A01', { quantity: 5 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: machineA, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineA}__A01`).update({ currentQuantity: 5 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: machineA, productId: skuId, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineA, 'snackItem', skuId, 'A01');

    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineA, yesterday);

    const performance = await productIntelligenceService.getNetworkProductPerformance(BUSINESS_ID, 7);
    const product = performance.find((p) => p.productId === skuId);
    expect(product?.unitsSold).toBe(0);
    expect(product?.marginPct).toBeNull();
    expect(product?.locationsStocked).toBe(1);
    expect(product?.locationsSelling).toBe(0);
  });
});

describe('ProductIntelligenceService.getTimeIntelligence', () => {
  it('reports insufficient_data with no sales in the window', async () => {
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-TIME-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const result = await productIntelligenceService.getTimeIntelligence(BUSINESS_ID, machineId, 30);
    expect(result.dataQuality).toBe('insufficient_data');
    expect(result.byHour.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

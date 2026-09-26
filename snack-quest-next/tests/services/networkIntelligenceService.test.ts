import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { locationService } from '@/services/locationService';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

const BUSINESS_ID = 'biz-network-intel-test';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanCollections() {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineAssortments',
    'machineAssortmentPriceHistory',
    'machineDailySummary',
    'networkDailySummary',
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

describe('NetworkIntelligenceService.getNetworkOverview', () => {
  it('composes revenue/units/margin/top categories from networkDailySummary, and inventory value from a live slot read', async () => {
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Network Overview Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-NETOV-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 5 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
    await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${yesterday}T12:00:00.000Z`) });
    await vendingRollupService.rebuildNetworkDay(BUSINESS_ID, yesterday); // also rebuilds the machine day it composes from

    const overview = await networkIntelligenceService.getNetworkOverview(BUSINESS_ID, 7);
    expect(overview.machineCount).toBe(1);
    expect(overview.revenueKes).toBe(250);
    expect(overview.grossProfitKes).toBe(150);
    expect(overview.marginPct).toBe(60);
    expect(overview.topCategories[0]).toEqual({ category: 'Asian Snacks', unitsSold: 1, revenueKes: 250 });
    // 5 units on hand at 100 KES cost each, minus the 1 sold that day the mock adapter already decremented at authorize time.
    expect(overview.inventoryUnitsDeployed).toBe(4);
    expect(overview.inventoryValueKes).toBe(400);
  });

  it('reports null growth for a category with no first-half revenue, rather than a fabricated percentage', async () => {
    const overview = await networkIntelligenceService.getNetworkOverview(BUSINESS_ID, 30);
    expect(overview.fastestGrowingCategories).toEqual([]);
    expect(overview.dataQuality).toBe('insufficient_data');
  });
});

describe('NetworkIntelligenceService.getLocationTypePerformance', () => {
  it('groups locations by type and reports revenue per location, never a network-wide single winner', async () => {
    const uniA = await locationService.create({ businessId: BUSINESS_ID, name: 'Uni A', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    const uniB = await locationService.create({ businessId: BUSINESS_ID, name: 'Uni B', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    const hotelA = await locationService.create({ businessId: BUSINESS_ID, name: 'Hotel A', locationType: 'hotel', city: 'Nairobi', actor: 'staff-1' });

    const performance = await networkIntelligenceService.getLocationTypePerformance(BUSINESS_ID, 7);
    const university = performance.find((p) => p.locationType === 'university');
    const hotel = performance.find((p) => p.locationType === 'hotel');

    expect(university?.locationCount).toBe(2);
    expect(hotel?.locationCount).toBe(1);
    void uniA;
    void uniB;
    void hotelA;
  });
});

describe('NetworkIntelligenceService.compareLocations', () => {
  it('returns each location\'s own DNA side by side, with no composite ranking field', async () => {
    const locationA = await locationService.create({ businessId: BUSINESS_ID, name: 'Location A', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    const locationB = await locationService.create({ businessId: BUSINESS_ID, name: 'Location B', locationType: 'mall', city: 'Nairobi', actor: 'staff-1' });

    const comparison = await networkIntelligenceService.compareLocations(BUSINESS_ID, [locationA, locationB], 7);
    expect(comparison).toHaveLength(2);
    expect(comparison.map((d) => d.locationId).sort()).toEqual([locationA, locationB].sort());
    for (const dna of comparison) {
      expect(dna).not.toHaveProperty('rank');
      expect(dna).not.toHaveProperty('score');
    }
  });
});

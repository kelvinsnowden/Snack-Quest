import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { locationService } from '@/services/locationService';
import { peerLearningService } from '@/services/peerLearningService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';
import type { Location } from '@/types';

const BUSINESS_ID = 'biz-peer-learning-test';
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

async function sellOneUnit(businessId: string, machineId: string, slotCode: string, adapter: MockVendingAdapter, onDate: string) {
  const transactions = new MachineTransactionService(() => adapter);
  const { id } = await transactions.createPending({ businessId, machineId, slotId: slotCode, paymentMethod: 'mpesa' });
  await transactions.markPaymentVerified(businessId, id, `mpesa-ref-${id}`);
  const { vendRef } = await transactions.authorizeVend(businessId, id);
  await transactions.applyVendResult({ businessId, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
  await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${onDate}T12:00:00.000Z`) });
}

async function setUpMachineAtLocation(locationType: Location['locationType'], skuId: string, priceKes: number, quantity: number) {
  const locationId = await locationService.create({ businessId: BUSINESS_ID, name: `${locationType}-${Date.now()}-${Math.random()}`, locationType, city: 'Nairobi', actor: 'staff-1' });
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  await machineService.relocate(BUSINESS_ID, machineId, { locationId, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
  const adapter = new MockVendingAdapter();
  const slots = new MachineSlotService(() => adapter);
  adapter.seedSlot(machineId, 'A01', { quantity });
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes, capacity: 20, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
  await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');
  return { locationId, machineId, adapter };
}

describe('PeerLearningService.getProductLocationTypeAffinity', () => {
  it('identifies the best-performing location type only once two different types actually have sales', async () => {
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Affinity Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));

    const university = await setUpMachineAtLocation('university', skuId, 250, 10);
    await sellOneUnit(BUSINESS_ID, university.machineId, 'A01', university.adapter, yesterday);
    await sellOneUnit(BUSINESS_ID, university.machineId, 'A01', university.adapter, yesterday);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, university.machineId, yesterday);

    const hotel = await setUpMachineAtLocation('hotel', skuId, 250, 10);
    await sellOneUnit(BUSINESS_ID, hotel.machineId, 'A01', hotel.adapter, yesterday);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, hotel.machineId, yesterday);

    const affinity = await peerLearningService.getProductLocationTypeAffinity(BUSINESS_ID, skuId, 7);
    expect(affinity.bestPerformingLocationType).toBe('university'); // 2 units sold there vs 1 at the hotel
    expect(affinity.byType.find((t) => t.locationType === 'university')?.locationCount).toBe(1);
  });

  it('reports no best-performing type when only one location type has any sales at all', async () => {
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Single Type Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const university = await setUpMachineAtLocation('university', skuId, 250, 10);
    await sellOneUnit(BUSINESS_ID, university.machineId, 'A01', university.adapter, yesterday);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, university.machineId, yesterday);

    const affinity = await peerLearningService.getProductLocationTypeAffinity(BUSINESS_ID, skuId, 7);
    expect(affinity.bestPerformingLocationType).toBeNull();
  });
});

describe('PeerLearningService.recommendAssortmentForNewMachine', () => {
  it('ranks candidates by real revenue-per-location among existing locations of the same type', async () => {
    const skuHigh = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'High Performer', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const skuLow = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Low Performer', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));

    const uniHigh = await setUpMachineAtLocation('university', skuHigh, 300, 10);
    await sellOneUnit(BUSINESS_ID, uniHigh.machineId, 'A01', uniHigh.adapter, yesterday);
    await sellOneUnit(BUSINESS_ID, uniHigh.machineId, 'A01', uniHigh.adapter, yesterday);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, uniHigh.machineId, yesterday);

    const uniLow = await setUpMachineAtLocation('university', skuLow, 100, 10);
    await sellOneUnit(BUSINESS_ID, uniLow.machineId, 'A01', uniLow.adapter, yesterday);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, uniLow.machineId, yesterday);

    const recommendation = await peerLearningService.recommendAssortmentForNewMachine(BUSINESS_ID, 'university', 1);
    expect(recommendation).toHaveLength(1);
    expect(recommendation[0].productId).toBe(skuHigh);
  });
});

describe('PeerLearningService.findProductOpportunities', () => {
  it('flags a product with a high repeated-stockout frequency', async () => {
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Chronically Out Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const location = await setUpMachineAtLocation('university', skuId, 250, 0); // zero stock — a stockout snapshot every day
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, location.machineId, yesterday);

    const opportunities = await peerLearningService.findProductOpportunities(BUSINESS_ID, 7);
    const stockoutOpportunity = opportunities.find((o) => o.type === 'repeated_stockout' && o.productId === skuId);
    expect(stockoutOpportunity).toBeDefined();
  });

  it('flags a product priced far from its own category\'s peer average', async () => {
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const skuPeerA = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Peer A', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const skuPeerB = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Peer B', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const skuPeerC = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Peer C', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const skuOutlier = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Price Outlier', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );

    for (const sku of [skuPeerA, skuPeerB, skuPeerC]) {
      const m = await setUpMachineAtLocation('university', sku, 200, 10);
      await sellOneUnit(BUSINESS_ID, m.machineId, 'A01', m.adapter, yesterday);
      await vendingRollupService.rebuildMachineDay(BUSINESS_ID, m.machineId, yesterday);
    }
    const outlierMachine = await setUpMachineAtLocation('university', skuOutlier, 500, 10);
    await sellOneUnit(BUSINESS_ID, outlierMachine.machineId, 'A01', outlierMachine.adapter, yesterday);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, outlierMachine.machineId, yesterday);

    const opportunities = await peerLearningService.findProductOpportunities(BUSINESS_ID, 7);
    const priceGap = opportunities.find((o) => o.type === 'price_gap' && o.productId === skuOutlier);
    expect(priceGap).toBeDefined();
    expect(priceGap?.supportingMetrics.deviationPct).toBeGreaterThan(0);

    const noGapForPeers = opportunities.find((o) => o.type === 'price_gap' && o.productId === skuPeerA);
    expect(noGapForPeers).toBeUndefined();
  });
});

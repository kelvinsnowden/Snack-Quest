import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { locationService } from '@/services/locationService';
import { locationIntelligenceService, LocationNotFoundError } from '@/services/locationIntelligenceService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

const BUSINESS_ID = 'biz-location-intel-test';
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

describe('LocationIntelligenceService.getLocationDna', () => {
  it('composes revenue/units/margin/category mix from every machine at the location, over the trailing window', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Test University', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Location DNA Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );

    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-DNA-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    await machineService.relocate(BUSINESS_ID, machineId, { locationId, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');

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
    await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${yesterday}T13:00:00.000Z`) });
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const dna = await locationIntelligenceService.getLocationDna(BUSINESS_ID, locationId, 7);
    expect(dna.machineCount).toBe(1);
    expect(dna.revenueKes).toBe(250);
    expect(dna.unitsSold).toBe(1);
    expect(dna.grossProfitKes).toBe(150);
    expect(dna.marginPct).toBe(60);
    expect(dna.categoryMix['Asian Snacks']).toEqual({ unitsSold: 1, revenueKes: 250 });
    expect(dna.assortmentDepth).toBe(1);
    expect(dna.topProducts[0]?.productId).toBe(skuId);
    expect(dna.peakHours[13]).toBe(1);
  });

  it('throws LocationNotFoundError for a location that does not exist', async () => {
    await expect(locationIntelligenceService.getLocationDna(BUSINESS_ID, 'ghost-location', 7)).rejects.toThrow(LocationNotFoundError);
  });

  it('reports zeroes, not errors, for a location with no machines yet', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Empty Location', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    const dna = await locationIntelligenceService.getLocationDna(BUSINESS_ID, locationId, 7);
    expect(dna.machineCount).toBe(0);
    expect(dna.revenueKes).toBe(0);
    expect(dna.dataQuality).toBe('insufficient_data');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { machineInventoryReserveService, DEFAULT_RESERVE_TARGET_KES } from '@/services/machineInventoryReserveService';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const BUSINESS_ID = 'biz-reserve-test';
const sharedAdapter = defaultVendingAdapterResolver('mock') as MockVendingAdapter;
const slotService = new MachineSlotService(() => sharedAdapter);

async function cleanCollections() {
  for (const collection of ['machines', 'machineSlots', 'snackItems', 'packages', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionMachine(machineCode: string, inventoryReserveTargetKes?: number | null) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'mock',
    model: 'test',
    inventoryReserveTargetKes,
    actor: 'staff-1',
  });
  return machineId;
}

describe('MachineInventoryReserveService', () => {
  it('uses the platform default of 100,000 when the machine has no override', async () => {
    const machineId = await provisionMachine('SQ-RESERVE-DEFAULT');
    const status = await machineInventoryReserveService.getReserveStatus(BUSINESS_ID, machineId);
    expect(status.targetKes).toBe(DEFAULT_RESERVE_TARGET_KES);
    expect(status.currentAtCostKes).toBe(0);
    expect(status.replenishmentRequiredKes).toBe(DEFAULT_RESERVE_TARGET_KES);
  });

  it('honours a machine-specific override', async () => {
    const machineId = await provisionMachine('SQ-RESERVE-OVERRIDE', 50_000);
    const status = await machineInventoryReserveService.getReserveStatus(BUSINESS_ID, machineId);
    expect(status.targetKes).toBe(50_000);
  });

  it('computes cost/retail value from real snackItem-backed slots, and the replenishment gap', async () => {
    const machineId = await provisionMachine('SQ-RESERVE-STOCKED');
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Korean Spicy Snack', imageUrl: null, expectedUnitCostKes: 180, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    sharedAdapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 350, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });

    const status = await machineInventoryReserveService.getReserveStatus(BUSINESS_ID, machineId);
    expect(status.currentAtCostKes).toBe(1_800); // 10 * 180
    expect(status.currentAtRetailKes).toBe(3_500); // 10 * 350
    expect(status.varianceKes).toBe(1_800 - DEFAULT_RESERVE_TARGET_KES);
    expect(status.replenishmentRequiredKes).toBe(DEFAULT_RESERVE_TARGET_KES - 1_800);
    expect(status.unpricedSlotCount).toBe(0);
  });

  it('counts a package-backed slot with stock as unpriced, never as free', async () => {
    const machineId = await provisionMachine('SQ-RESERVE-PACKAGE');
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Discovery Box', description: 'A box', priceKes: 1200, isActive: true, imageUrl: null },
      'staff-1',
    );
    sharedAdapter.seedSlot(machineId, 'B01', { quantity: 3 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'B01', productId: packageId, productCatalogue: 'package', priceKes: 1200, capacity: 5, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__B01`).update({ currentQuantity: 3 });

    const status = await machineInventoryReserveService.getReserveStatus(BUSINESS_ID, machineId);
    expect(status.currentAtCostKes).toBe(0); // package has no known cost — never fabricated
    expect(status.currentAtRetailKes).toBe(3_600); // 3 * 1200 — retail is always known
    expect(status.unpricedSlotCount).toBe(1);
  });

  it('never counts an empty slot as unpriced, even without a resolvable cost', async () => {
    const machineId = await provisionMachine('SQ-RESERVE-EMPTY');
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Empty Box', description: 'A box', priceKes: 1200, isActive: true, imageUrl: null },
      'staff-1',
    );
    sharedAdapter.seedSlot(machineId, 'C01', { quantity: 0 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'C01', productId: packageId, productCatalogue: 'package', priceKes: 1200, capacity: 5, position: 1 });

    const status = await machineInventoryReserveService.getReserveStatus(BUSINESS_ID, machineId);
    expect(status.unpricedSlotCount).toBe(0);
  });
});

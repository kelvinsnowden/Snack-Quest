import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { machineAssortmentService, ProductNotFoundError } from '@/services/machineAssortmentService';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { adminFirestore } from '@/lib/firebase/admin';
import { snackItemRepository } from '@/repositories/snackItemRepository';

const BUSINESS_ID = 'biz-assortment-test';
const sharedAdapter = defaultVendingAdapterResolver('mock') as MockVendingAdapter;
const slotService = new MachineSlotService(() => sharedAdapter);

async function cleanCollections() {
  for (const collection of ['machines', 'machineSlots', 'machineAssortments', 'machineAssortmentPriceHistory', 'snackItems', 'deviceCredentials']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionMachine(machineCode: string) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

async function createSnackItem(name: string, costKes: number) {
  return snackItemRepository.create(
    {
      businessId: BUSINESS_ID,
      name,
      imageUrl: null,
      expectedUnitCostKes: costKes,
      unitLabel: 'bag',
      origin: 'Korea',
      sourcingNote: null,
      isActive: true,
    },
    'staff-1',
  );
}

describe('MachineAssortmentService — isolation', () => {
  it('never returns a product to Machine A merely because it exists globally or is assorted to Machine B', async () => {
    const machineA = await provisionMachine('SQ-ASSORT-A');
    const machineB = await provisionMachine('SQ-ASSORT-B');
    const sku1 = await createSnackItem('Korean Spicy Snack', 180);
    const sku2 = await createSnackItem('Japanese Gummy', 120);

    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: machineA, productId: sku1, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: machineB, productId: sku2, productCatalogue: 'snackItem', actor: 'staff-1' });

    const catalogA = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineA);
    const catalogB = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineB);

    expect(catalogA.map((item) => item.productId)).toEqual([sku1]);
    expect(catalogB.map((item) => item.productId)).toEqual([sku2]);
    // The most direct assertion the brief itself names: SKU2 must never appear for Machine A.
    expect(catalogA.some((item) => item.productId === sku2)).toBe(false);
  });

  it('refuses to assort a product that does not exist in its catalogue', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-GHOST');
    await expect(
      machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: 'ghost-sku', productCatalogue: 'snackItem', actor: 'staff-1' }),
    ).rejects.toThrow(ProductNotFoundError);
  });
});

describe('MachineAssortmentService — the three product states', () => {
  it('stays assorted but not sellable when stock is zero', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-ZERO');
    const sku = await createSnackItem('Korean Snack', 180);
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: sku, productCatalogue: 'snackItem', actor: 'staff-1' });
    sharedAdapter.seedSlot(machineId, 'A03', { quantity: 0 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A03', productId: sku, productCatalogue: 'snackItem', priceKes: 350, capacity: 8, position: 1 });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', sku, 'A03');

    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].sellable).toBe(false);

    // Restock and activate the machine, and it becomes sellable — proving the same row flips state rather than a new one being needed.
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A03`).update({ currentQuantity: 8 });
    await adminFirestore.collection('machines').doc(machineId).update({ status: 'active' });
    const restocked = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(restocked[0].sellable).toBe(true);
  });

  it('is not sellable when assorted and in stock but not yet linked to a slot', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-UNPLACED');
    const sku = await createSnackItem('Not Yet Placed', 100);
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: sku, productCatalogue: 'snackItem', actor: 'staff-1' });

    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].slotCode).toBeNull();
    expect(catalog[0].sellable).toBe(false);
  });

  it('is not sellable when the machine itself is not active, even with stock', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-OFFLINE');
    const sku = await createSnackItem('Machine Offline Snack', 100);
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: sku, productCatalogue: 'snackItem', actor: 'staff-1' });
    sharedAdapter.seedSlot(machineId, 'A01', { quantity: 8 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: sku, productCatalogue: 'snackItem', priceKes: 300, capacity: 8, position: 1 });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', sku, 'A01');
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 8 });
    // Machine starts 'provisioning' — never active until installed/tested.
    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog[0].sellable).toBe(false);
  });

  it('unassorting removes a product from the sellable catalog without deleting its history', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-REMOVE');
    const sku = await createSnackItem('Removable Snack', 100);
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: sku, productCatalogue: 'snackItem', actor: 'staff-1' });
    expect(await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId)).toHaveLength(1);

    await machineAssortmentService.unassortProduct(BUSINESS_ID, machineId, 'snackItem', sku);
    expect(await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId)).toHaveLength(0);

    const row = await machineAssortmentRepository.findByProduct(BUSINESS_ID, machineId, 'snackItem', sku);
    expect(row).not.toBeNull(); // row survives — only `assorted` flips
    expect(row?.assorted).toBe(false);
  });
});

describe('MachineAssortmentService — price overrides', () => {
  it('a price override wins over the slot price, and writes an audit trail entry', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-PRICE');
    const sku = await createSnackItem('Overridden Snack', 150);
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: sku, productCatalogue: 'snackItem', actor: 'staff-1' });
    sharedAdapter.seedSlot(machineId, 'B01', { quantity: 8 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'B01', productId: sku, productCatalogue: 'snackItem', priceKes: 300, capacity: 8, position: 1 });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', sku, 'B01');
    await adminFirestore.collection('machineSlots').doc(`${machineId}__B01`).update({ currentQuantity: 8 });

    await machineAssortmentService.setPriceOverride(BUSINESS_ID, machineId, 'snackItem', sku, 400, 'staff-1');
    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog[0].priceKes).toBe(400);

    const history = await machineAssortmentRepository.listPriceHistory(BUSINESS_ID, machineId, sku);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ previousPriceOverrideKes: null, newPriceOverrideKes: 400, actor: 'staff-1' });
  });

  it('falls back to the slot price when no override is set', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-NOPRICE');
    const sku = await createSnackItem('Default Priced Snack', 150);
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: sku, productCatalogue: 'snackItem', actor: 'staff-1' });
    sharedAdapter.seedSlot(machineId, 'C01', { quantity: 8 });
    await slotService.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'C01', productId: sku, productCatalogue: 'snackItem', priceKes: 320, capacity: 8, position: 1 });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', sku, 'C01');
    await adminFirestore.collection('machineSlots').doc(`${machineId}__C01`).update({ currentQuantity: 8 });

    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog[0].priceKes).toBe(320);
  });
});

describe('MachineAssortmentService — promotional window', () => {
  it('reports promotionalState as none once the promotional window has passed, without un-assorting the product', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-PROMO');
    const sku = await createSnackItem('Expired Promo Snack', 100);
    await machineAssortmentService.assortProduct({
      businessId: BUSINESS_ID,
      machineId,
      productId: sku,
      productCatalogue: 'snackItem',
      promotionalState: 'featured',
      effectiveFrom: new Date(Date.now() - 60 * 60 * 1000),
      effectiveTo: new Date(Date.now() - 30 * 60 * 1000), // already ended
      actor: 'staff-1',
    });

    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog).toHaveLength(1); // still assorted
    expect(catalog[0].promotionalState).toBe('none'); // but no longer promoted
  });

  it('reports the real promotional state while inside the window', async () => {
    const machineId = await provisionMachine('SQ-ASSORT-PROMO-LIVE');
    const sku = await createSnackItem('Live Promo Snack', 100);
    await machineAssortmentService.assortProduct({
      businessId: BUSINESS_ID,
      machineId,
      productId: sku,
      productCatalogue: 'snackItem',
      promotionalState: 'featured',
      effectiveFrom: new Date(Date.now() - 60 * 60 * 1000),
      effectiveTo: new Date(Date.now() + 60 * 60 * 1000),
      actor: 'staff-1',
    });

    const catalog = await machineAssortmentService.getSellableCatalog(BUSINESS_ID, machineId);
    expect(catalog[0].promotionalState).toBe('featured');
  });
});

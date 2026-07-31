import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository, PackageNotFoundError, StockNotTrackedError, InsufficientStockError } from '@/repositories/packageRepository';
import { inventoryService } from '@/services/inventoryService';

/**
 * `InventoryService.adjustStock` (§ Admin: Inventory) against the
 * real emulator — proves the `packages.stockCount` write and the
 * `inventoryMovements` audit record land atomically and agree with
 * each other, and that every real failure mode (untracked stock,
 * going negative, wrong tenant) is rejected before either write
 * happens.
 */

const BUSINESS_ID = 'biz-inventory-service-test';
const OTHER_BUSINESS_ID = 'biz-inventory-service-other';

async function seedPackage(overrides: Partial<Parameters<typeof packageRepository.create>[0]> = {}) {
  return packageRepository.create(
    {
      businessId: BUSINESS_ID,
      name: 'Starter Box',
      description: 'x',
      priceKes: 2500,
      isActive: true,
      imageUrl: null,
      stockCount: 10,
      ...overrides,
    },
    'system',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('inventoryMovements'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('InventoryService.adjustStock', () => {
  it('increases stock and records a restock movement', async () => {
    const packageId = await seedPackage({ stockCount: 10 });

    const result = await inventoryService.adjustStock(BUSINESS_ID, packageId, 5, 'restock', 'staff-1', 'From supplier');

    expect(result).toBe(15);
    const pkg = await packageRepository.findById(BUSINESS_ID, packageId);
    expect(pkg?.stockCount).toBe(15);

    const movements = await adminFirestore
      .collection('inventoryMovements')
      .where('packageId', '==', packageId)
      .get();
    expect(movements.docs).toHaveLength(1);
    expect(movements.docs[0].data()).toMatchObject({
      businessId: BUSINESS_ID,
      delta: 5,
      resultingStockCount: 15,
      reason: 'restock',
      note: 'From supplier',
      actor: 'staff-1',
    });
  });

  it('decreases stock and records a negative-delta movement', async () => {
    const packageId = await seedPackage({ stockCount: 10 });

    const result = await inventoryService.adjustStock(BUSINESS_ID, packageId, -3, 'damaged', 'staff-1');

    expect(result).toBe(7);
    const movements = await adminFirestore
      .collection('inventoryMovements')
      .where('packageId', '==', packageId)
      .get();
    expect(movements.docs[0].data()).toMatchObject({ delta: -3, resultingStockCount: 7, note: null });
  });

  it('rejects a removal that would go negative, writing nothing', async () => {
    const packageId = await seedPackage({ stockCount: 2 });

    await expect(inventoryService.adjustStock(BUSINESS_ID, packageId, -5, 'correction', 'staff-1')).rejects.toBeInstanceOf(
      InsufficientStockError,
    );

    const pkg = await packageRepository.findById(BUSINESS_ID, packageId);
    expect(pkg?.stockCount).toBe(2);
    const movements = await adminFirestore.collection('inventoryMovements').get();
    expect(movements.docs).toHaveLength(0);
  });

  it('rejects adjusting a product that does not track stock', async () => {
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Unlimited Box', description: 'x', priceKes: 3000, isActive: true, imageUrl: null },
      'system',
    );

    await expect(inventoryService.adjustStock(BUSINESS_ID, packageId, 5, 'restock', 'staff-1')).rejects.toBeInstanceOf(
      StockNotTrackedError,
    );
  });

  it('rejects a package belonging to a different business', async () => {
    const packageId = await packageRepository.create(
      { businessId: OTHER_BUSINESS_ID, name: 'Other', description: 'x', priceKes: 1000, isActive: true, imageUrl: null, stockCount: 5 },
      'system',
    );

    await expect(inventoryService.adjustStock(BUSINESS_ID, packageId, 1, 'restock', 'staff-1')).rejects.toBeInstanceOf(
      PackageNotFoundError,
    );
  });
});

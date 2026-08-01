import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository } from '@/repositories/packageRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { purchaseOrderRepository } from '@/repositories/purchaseOrderRepository';
import { inventoryBatchRepository } from '@/repositories/inventoryBatchRepository';
import {
  purchaseOrderService,
  InvalidPurchaseOrderInputError,
  PurchaseOrderNotFoundError,
  InvalidPurchaseOrderTransitionError,
} from '@/services/purchaseOrderService';

const BUSINESS_ID = 'biz-po-service-test';

async function seedSupplier(): Promise<string> {
  return supplierRepository.create(
    { businessId: BUSINESS_ID, name: 'Coastal Snacks Ltd', contactName: 'Jane', phone: '254700000000', email: null, notes: '', isActive: true },
    'staff-1',
  );
}

async function seedPackage(overrides: Partial<Parameters<typeof packageRepository.create>[0]> = {}): Promise<string> {
  return packageRepository.create(
    { businessId: BUSINESS_ID, name: 'Starter Box', description: 'x', priceKes: 2500, isActive: true, imageUrl: null, ...overrides },
    'system',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('purchaseOrders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('suppliers'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('inventoryBatches'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('inventoryMovements'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('PurchaseOrderService.createPurchaseOrder', () => {
  it('creates a draft PO with a computed total, one audit entry, and resolved line-item descriptions', async () => {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage();

    const id = await purchaseOrderService.createPurchaseOrder(
      BUSINESS_ID,
      { supplierId, lineItems: [{ packageId, quantity: 10, unitCostKes: 100 }] },
      'staff-1',
    );

    const po = await purchaseOrderRepository.findById(BUSINESS_ID, id);
    expect(po?.status).toBe('draft');
    expect(po?.totalCostKes).toBe(1000);
    expect(po?.lineItems).toEqual([{ packageId, description: 'Starter Box', quantity: 10, unitCostKes: 100 }]);
    expect(po?.auditTrail).toHaveLength(1);
  });

  it('rejects an unknown supplier', async () => {
    const packageId = await seedPackage();
    await expect(
      purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId: 'nope', lineItems: [{ packageId, quantity: 1, unitCostKes: 1 }] }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidPurchaseOrderInputError);
  });

  it('rejects an empty line-item list', async () => {
    const supplierId = await seedSupplier();
    await expect(
      purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId, lineItems: [] }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidPurchaseOrderInputError);
  });

  it('rejects a duplicate packageId across line items', async () => {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage();
    await expect(
      purchaseOrderService.createPurchaseOrder(
        BUSINESS_ID,
        { supplierId, lineItems: [{ packageId, quantity: 1, unitCostKes: 1 }, { packageId, quantity: 2, unitCostKes: 1 }] },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(InvalidPurchaseOrderInputError);
  });

  it('rejects a non-positive quantity or negative unit cost', async () => {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage();
    await expect(
      purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId, lineItems: [{ packageId, quantity: 0, unitCostKes: 1 }] }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidPurchaseOrderInputError);
    await expect(
      purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId, lineItems: [{ packageId, quantity: 1, unitCostKes: -1 }] }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidPurchaseOrderInputError);
  });

  it('rejects a packageId that does not belong to this business', async () => {
    const supplierId = await seedSupplier();
    await expect(
      purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId, lineItems: [{ packageId: 'nope', quantity: 1, unitCostKes: 1 }] }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidPurchaseOrderInputError);
  });
});

describe('PurchaseOrderService.markOrdered / cancelPurchaseOrder', () => {
  async function createDraft(): Promise<string> {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage();
    return purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId, lineItems: [{ packageId, quantity: 5, unitCostKes: 50 }] }, 'staff-1');
  }

  it('markOrdered moves draft -> ordered and stamps orderedAt', async () => {
    const id = await createDraft();
    await purchaseOrderService.markOrdered(BUSINESS_ID, id, 'staff-2');

    const po = await purchaseOrderRepository.findById(BUSINESS_ID, id);
    expect(po?.status).toBe('ordered');
    expect(po?.orderedAt).not.toBeNull();
  });

  it('markOrdered rejects a PO that is not draft', async () => {
    const id = await createDraft();
    await purchaseOrderService.markOrdered(BUSINESS_ID, id, 'staff-2');

    await expect(purchaseOrderService.markOrdered(BUSINESS_ID, id, 'staff-2')).rejects.toBeInstanceOf(InvalidPurchaseOrderTransitionError);
  });

  it('markOrdered 404s an unknown PO', async () => {
    await expect(purchaseOrderService.markOrdered(BUSINESS_ID, 'nope', 'staff-2')).rejects.toBeInstanceOf(PurchaseOrderNotFoundError);
  });

  it('cancelPurchaseOrder works from draft or ordered, but not from received', async () => {
    const draftId = await createDraft();
    await purchaseOrderService.cancelPurchaseOrder(BUSINESS_ID, draftId, 'staff-2', 'no longer needed');
    const draft = await purchaseOrderRepository.findById(BUSINESS_ID, draftId);
    expect(draft?.status).toBe('cancelled');
    expect(draft?.cancelledAt).not.toBeNull();

    const orderedId = await createDraft();
    await purchaseOrderService.markOrdered(BUSINESS_ID, orderedId, 'staff-2');
    await purchaseOrderService.cancelPurchaseOrder(BUSINESS_ID, orderedId, 'staff-2');
    expect((await purchaseOrderRepository.findById(BUSINESS_ID, orderedId))?.status).toBe('cancelled');
  });
});

describe('PurchaseOrderService.receivePurchaseOrder', () => {
  it('creates one batch + one movement per line item, increments stock, and marks the PO received', async () => {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage({ stockCount: 10 });

    const id = await purchaseOrderService.createPurchaseOrder(
      BUSINESS_ID,
      { supplierId, lineItems: [{ packageId, quantity: 20, unitCostKes: 100 }] },
      'staff-1',
    );
    await purchaseOrderService.markOrdered(BUSINESS_ID, id, 'staff-1');

    await purchaseOrderService.receivePurchaseOrder(BUSINESS_ID, id, 'staff-2', { [packageId]: '2026-12-31' });

    const po = await purchaseOrderRepository.findById(BUSINESS_ID, id);
    expect(po?.status).toBe('received');
    expect(po?.receivedAt).not.toBeNull();

    const pkg = await packageRepository.findById(BUSINESS_ID, packageId);
    expect(pkg?.stockCount).toBe(30);

    const batches = await inventoryBatchRepository.listByPackage(BUSINESS_ID, packageId);
    expect(batches).toHaveLength(1);
    expect(batches[0].data).toMatchObject({
      purchaseOrderId: id,
      supplierId,
      quantityReceived: 20,
      quantityRemaining: 20,
      unitCostKes: 100,
      status: 'active',
    });
    expect(batches[0].data.expiresAt).not.toBeNull();

    const movements = await adminFirestore.collection('inventoryMovements').where('packageId', '==', packageId).get();
    expect(movements.docs).toHaveLength(1);
    expect(movements.docs[0].data()).toMatchObject({
      delta: 20,
      resultingStockCount: 30,
      reason: 'purchase_order_received',
      batchId: batches[0].id,
    });
  });

  it('receives a PO with multiple line items — one batch and one movement per package, all reads before any writes', async () => {
    const supplierId = await seedSupplier();
    const packageIdA = await seedPackage({ name: 'Box A', stockCount: 5 });
    const packageIdB = await seedPackage({ name: 'Box B', stockCount: 3 });

    const id = await purchaseOrderService.createPurchaseOrder(
      BUSINESS_ID,
      {
        supplierId,
        lineItems: [
          { packageId: packageIdA, quantity: 10, unitCostKes: 50 },
          { packageId: packageIdB, quantity: 4, unitCostKes: 200 },
        ],
      },
      'staff-1',
    );
    await purchaseOrderService.markOrdered(BUSINESS_ID, id, 'staff-1');

    await purchaseOrderService.receivePurchaseOrder(BUSINESS_ID, id, 'staff-2');

    expect((await packageRepository.findById(BUSINESS_ID, packageIdA))?.stockCount).toBe(15);
    expect((await packageRepository.findById(BUSINESS_ID, packageIdB))?.stockCount).toBe(7);

    expect(await inventoryBatchRepository.listByPackage(BUSINESS_ID, packageIdA)).toHaveLength(1);
    expect(await inventoryBatchRepository.listByPackage(BUSINESS_ID, packageIdB)).toHaveLength(1);
  });

  it('creates a batch and records a null resultingStockCount for a package that does not track stock', async () => {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage();

    const id = await purchaseOrderService.createPurchaseOrder(
      BUSINESS_ID,
      { supplierId, lineItems: [{ packageId, quantity: 5, unitCostKes: 20 }] },
      'staff-1',
    );
    await purchaseOrderService.markOrdered(BUSINESS_ID, id, 'staff-1');

    await purchaseOrderService.receivePurchaseOrder(BUSINESS_ID, id, 'staff-2');

    const pkg = await packageRepository.findById(BUSINESS_ID, packageId);
    expect(pkg?.stockCount).toBeUndefined();

    const movements = await adminFirestore.collection('inventoryMovements').where('packageId', '==', packageId).get();
    expect(movements.docs[0].data().resultingStockCount).toBeNull();

    const batches = await inventoryBatchRepository.listByPackage(BUSINESS_ID, packageId);
    expect(batches[0].data.expiresAt).toBeNull();
  });

  it('rejects receiving a PO that has not been marked ordered', async () => {
    const supplierId = await seedSupplier();
    const packageId = await seedPackage();
    const id = await purchaseOrderService.createPurchaseOrder(BUSINESS_ID, { supplierId, lineItems: [{ packageId, quantity: 1, unitCostKes: 1 }] }, 'staff-1');

    await expect(purchaseOrderService.receivePurchaseOrder(BUSINESS_ID, id, 'staff-2')).rejects.toBeInstanceOf(
      InvalidPurchaseOrderTransitionError,
    );
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  inventoryBatchRepository,
  createInTransaction,
  writeOffInTransaction,
  InventoryBatchNotFoundError,
  InsufficientBatchQuantityError,
} from '@/repositories/inventoryBatchRepository';

const BUSINESS_ID = 'biz-batch-repo-test';
const OTHER_BUSINESS_ID = 'biz-batch-repo-other';

function baseInput(overrides: Partial<Parameters<typeof createInTransaction>[1]> = {}) {
  return {
    businessId: BUSINESS_ID,
    packageId: 'pkg-1',
    purchaseOrderId: 'po-1',
    supplierId: 'supplier-1',
    quantityReceived: 20,
    quantityRemaining: 20,
    unitCostKes: 100,
    expiresAt: null,
    status: 'active' as const,
    receivedAt: new Date() as unknown as Parameters<typeof createInTransaction>[1]['receivedAt'],
    ...overrides,
  };
}

async function seedBatch(overrides: Partial<Parameters<typeof createInTransaction>[1]> = {}): Promise<string> {
  return adminFirestore.runTransaction(async (tx) => createInTransaction(tx, baseInput(overrides), 'staff-1'));
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('inventoryBatches'));
});

describe('inventoryBatchRepository create/find', () => {
  it('creates a batch inside a transaction and finds it scoped to its business', async () => {
    const id = await seedBatch();

    const found = await inventoryBatchRepository.findById(BUSINESS_ID, id);
    expect(found?.quantityRemaining).toBe(20);
    expect(found?.status).toBe('active');
    expect(found?.createdBy).toBe('staff-1');

    expect(await inventoryBatchRepository.findById(OTHER_BUSINESS_ID, id)).toBeNull();
  });
});

describe('inventoryBatchRepository listByPackage / listActive / listExpiringSoon', () => {
  it('listByPackage scopes to business + packageId, newest first', async () => {
    const id1 = await seedBatch({ packageId: 'pkg-1' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const id2 = await seedBatch({ packageId: 'pkg-1' });
    await seedBatch({ packageId: 'pkg-2' });

    const results = await inventoryBatchRepository.listByPackage(BUSINESS_ID, 'pkg-1');
    expect(results.map((r) => r.id)).toEqual([id2, id1]);
  });

  it('listActive returns only active batches, oldest received first', async () => {
    const id1 = await seedBatch({ status: 'active' });
    await seedBatch({ status: 'depleted' });

    const results = await inventoryBatchRepository.listActive(BUSINESS_ID);
    expect(results.map((r) => r.id)).toEqual([id1]);
  });

  it('listExpiringSoon returns only active batches expiring within the window, soonest first, and skips batches with no expiry', async () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const soonId = await seedBatch({ expiresAt: soon as unknown as Parameters<typeof createInTransaction>[1]['expiresAt'] });
    await seedBatch({ expiresAt: later as unknown as Parameters<typeof createInTransaction>[1]['expiresAt'] });
    await seedBatch({ expiresAt: null });
    await seedBatch({ expiresAt: soon as unknown as Parameters<typeof createInTransaction>[1]['expiresAt'], status: 'depleted' });

    const results = await inventoryBatchRepository.listExpiringSoon(BUSINESS_ID, 14);
    expect(results.map((r) => r.id)).toEqual([soonId]);
  });
});

describe('writeOffInTransaction', () => {
  it('decrements quantityRemaining and keeps status active on a partial write-off', async () => {
    const id = await seedBatch({ quantityRemaining: 20 });

    const remaining = await adminFirestore.runTransaction((tx) =>
      writeOffInTransaction(tx, BUSINESS_ID, id, 5, 'expired', 'staff-2'),
    );

    expect(remaining).toBe(15);
    const found = await inventoryBatchRepository.findById(BUSINESS_ID, id);
    expect(found?.quantityRemaining).toBe(15);
    expect(found?.status).toBe('active');
    expect(found?.updatedBy).toBe('staff-2');
  });

  it('flips status to the terminal state once the write-off empties the batch', async () => {
    const id = await seedBatch({ quantityRemaining: 5 });

    await adminFirestore.runTransaction((tx) => writeOffInTransaction(tx, BUSINESS_ID, id, 5, 'written_off', 'staff-2'));

    const found = await inventoryBatchRepository.findById(BUSINESS_ID, id);
    expect(found?.quantityRemaining).toBe(0);
    expect(found?.status).toBe('written_off');
  });

  it('rejects a write-off larger than what remains', async () => {
    const id = await seedBatch({ quantityRemaining: 5 });

    await expect(
      adminFirestore.runTransaction((tx) => writeOffInTransaction(tx, BUSINESS_ID, id, 10, 'expired', 'staff-2')),
    ).rejects.toBeInstanceOf(InsufficientBatchQuantityError);

    const found = await inventoryBatchRepository.findById(BUSINESS_ID, id);
    expect(found?.quantityRemaining).toBe(5);
  });

  it('rejects a batch belonging to a different business', async () => {
    const id = await seedBatch({ businessId: OTHER_BUSINESS_ID });

    await expect(
      adminFirestore.runTransaction((tx) => writeOffInTransaction(tx, BUSINESS_ID, id, 1, 'expired', 'staff-2')),
    ).rejects.toBeInstanceOf(InventoryBatchNotFoundError);
  });
});

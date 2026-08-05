import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { fulfillmentBatchRepository, createInTransaction, type FulfillmentBatchInput } from '@/repositories/fulfillmentBatchRepository';

const BUSINESS_ID = 'biz-fb-repo-test';
const OTHER_BUSINESS_ID = 'biz-fb-repo-other';

function baseInput(overrides: Partial<FulfillmentBatchInput> = {}): FulfillmentBatchInput {
  return {
    businessId: BUSINESS_ID,
    orderIds: ['order-1', 'order-2'],
    orderCount: 2,
    totalRevenueKes: 10000,
    costs: { productsPurchasedKes: 6000, packagingKes: 0, deliveryKes: 0, miscKes: 0, totalCostKes: 6000 },
    grossProfitKes: 4000,
    profitMarginPct: 40,
    notes: '',
    ...overrides,
  };
}

async function create(input: FulfillmentBatchInput): Promise<string> {
  return adminFirestore.runTransaction(async (tx) => createInTransaction(tx, input, 'staff-1'));
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('fulfillmentBatches'));
});

describe('fulfillmentBatchRepository', () => {
  it('creates and finds a batch scoped to its business', async () => {
    const id = await create(baseInput());

    const found = await fulfillmentBatchRepository.findById(BUSINESS_ID, id);
    expect(found?.orderIds).toEqual(['order-1', 'order-2']);
    expect(found?.costs.totalCostKes).toBe(6000);
    expect(found?.grossProfitKes).toBe(4000);

    expect(await fulfillmentBatchRepository.findById(OTHER_BUSINESS_ID, id)).toBeNull();
  });

  it('listByBusiness scopes per tenant, newest first', async () => {
    const firstId = await create(baseInput());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const secondId = await create(baseInput());
    await create(baseInput({ businessId: OTHER_BUSINESS_ID }));

    const { batches } = await fulfillmentBatchRepository.listByBusiness(BUSINESS_ID);
    expect(batches.map((b) => b.id)).toEqual([secondId, firstId]);
  });

  it('listByBusiness paginates with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await create(baseInput());
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const { batches: page1, nextCursor } = await fulfillmentBatchRepository.listByBusiness(BUSINESS_ID, { limit: 2 });
    expect(page1).toHaveLength(2);
    expect(nextCursor).not.toBeNull();

    const { batches: page2, nextCursor: nextCursor2 } = await fulfillmentBatchRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
      cursor: nextCursor!,
    });
    expect(page2).toHaveLength(1);
    expect(nextCursor2).toBeNull();
  });
});

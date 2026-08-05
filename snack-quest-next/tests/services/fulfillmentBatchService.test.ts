import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { seedOrder } from '../helpers/orderFixtures';
import { fulfillmentBatchRepository } from '@/repositories/fulfillmentBatchRepository';
import {
  fulfillmentBatchService,
  InvalidFulfillmentBatchInputError,
  OrderAlreadyBatchedError,
  OrderNotEligibleForBatchError,
  OrderNotFoundError,
} from '@/services/fulfillmentBatchService';

const BUSINESS_ID = 'biz-fb-service-test';
const OTHER_BUSINESS_ID = 'biz-fb-service-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('fulfillmentBatches'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('FulfillmentBatchService.createFulfillmentBatch', () => {
  it('closes a batch whose per-order allocation sums exactly to the total cost, and stamps every order', async () => {
    const orderIds = await Promise.all(
      [1, 2, 3, 4, 5].map(() => seedOrder({ businessId: BUSINESS_ID, pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2500 } })),
    );

    const batchId = await fulfillmentBatchService.createFulfillmentBatch(
      BUSINESS_ID,
      { orderIds, productsPurchasedKes: 6000, packagingKes: 700, deliveryKes: 1100, miscKes: 150, notes: 'From Carrefour' },
      'staff-1',
    );

    const batch = await fulfillmentBatchRepository.findById(BUSINESS_ID, batchId);
    expect(batch?.costs.totalCostKes).toBe(7950);
    expect(batch?.totalRevenueKes).toBe(12500);
    expect(batch?.grossProfitKes).toBe(12500 - 7950);
    expect(batch?.orderCount).toBe(5);

    const orderSnapshots = await Promise.all(orderIds.map((id) => adminFirestore.collection('orders').doc(id).get()));
    const allocations = orderSnapshots.map((snapshot) => snapshot.data()!.fulfillment.allocatedCostKes as number);
    expect(allocations.reduce((sum, value) => sum + value, 0)).toBe(7950);
    for (const snapshot of orderSnapshots) {
      expect(snapshot.data()!.fulfillmentBatchId).toBe(batchId);
    }
  });

  it('defaults the optional costs to 0', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID });

    const batchId = await fulfillmentBatchService.createFulfillmentBatch(
      BUSINESS_ID,
      { orderIds: [orderId], productsPurchasedKes: 500 },
      'staff-1',
    );

    const batch = await fulfillmentBatchRepository.findById(BUSINESS_ID, batchId);
    expect(batch?.costs).toEqual({ productsPurchasedKes: 500, packagingKes: 0, deliveryKes: 0, miscKes: 0, totalCostKes: 500 });
  });

  it('rejects a negative productsPurchasedKes', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID });
    await expect(
      fulfillmentBatchService.createFulfillmentBatch(BUSINESS_ID, { orderIds: [orderId], productsPurchasedKes: -1 }, 'staff-1'),
    ).rejects.toThrow(InvalidFulfillmentBatchInputError);
  });

  it('rejects an empty orderIds list', async () => {
    await expect(
      fulfillmentBatchService.createFulfillmentBatch(BUSINESS_ID, { orderIds: [], productsPurchasedKes: 100 }, 'staff-1'),
    ).rejects.toThrow(InvalidFulfillmentBatchInputError);
  });

  it('rejects an order that does not exist', async () => {
    await expect(
      fulfillmentBatchService.createFulfillmentBatch(BUSINESS_ID, { orderIds: ['nope'], productsPurchasedKes: 100 }, 'staff-1'),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('rejects an order belonging to a different business', async () => {
    const orderId = await seedOrder({ businessId: OTHER_BUSINESS_ID });
    await expect(
      fulfillmentBatchService.createFulfillmentBatch(BUSINESS_ID, { orderIds: [orderId], productsPurchasedKes: 100 }, 'staff-1'),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('rejects an order already in another batch', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, fulfillmentBatchId: 'batch-existing' });
    await expect(
      fulfillmentBatchService.createFulfillmentBatch(BUSINESS_ID, { orderIds: [orderId], productsPurchasedKes: 100 }, 'staff-1'),
    ).rejects.toThrow(OrderAlreadyBatchedError);
  });

  it('rejects a cancelled order', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled' });
    await expect(
      fulfillmentBatchService.createFulfillmentBatch(BUSINESS_ID, { orderIds: [orderId], productsPurchasedKes: 100 }, 'staff-1'),
    ).rejects.toThrow(OrderNotEligibleForBatchError);
  });

  it('never partially writes — a rejected batch leaves every order untouched', async () => {
    const eligibleId = await seedOrder({ businessId: BUSINESS_ID });
    const cancelledId = await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled' });

    await expect(
      fulfillmentBatchService.createFulfillmentBatch(
        BUSINESS_ID,
        { orderIds: [eligibleId, cancelledId], productsPurchasedKes: 100 },
        'staff-1',
      ),
    ).rejects.toThrow(OrderNotEligibleForBatchError);

    const eligible = await adminFirestore.collection('orders').doc(eligibleId).get();
    expect(eligible.data()?.fulfillmentBatchId).toBeNull();
    const { batches } = await fulfillmentBatchRepository.listByBusiness(BUSINESS_ID);
    expect(batches).toHaveLength(0);
  });
});

describe('FulfillmentBatchService.getFulfillmentBatchWithOrders', () => {
  it('returns the batch with every one of its orders, tenant-scoped', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID });
    const batchId = await fulfillmentBatchService.createFulfillmentBatch(
      BUSINESS_ID,
      { orderIds: [orderId], productsPurchasedKes: 1000 },
      'staff-1',
    );

    const { batch, orders } = await fulfillmentBatchService.getFulfillmentBatchWithOrders(BUSINESS_ID, batchId);
    expect(batch.orderIds).toEqual([orderId]);
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(orderId);
  });
});

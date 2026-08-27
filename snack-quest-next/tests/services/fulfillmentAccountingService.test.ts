import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { fulfillmentAccountingService } from '@/services/fulfillmentAccountingService';
import { fulfillmentBatchService } from '@/services/fulfillmentBatchService';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * `FulfillmentAccountingService.getOverview` (§ Fulfillment Batches —
 * accounting). The property under test throughout is that revenue with
 * no recorded cost is never counted as profit: an order waiting for a
 * shopping trip to be costed against it looks like 100% margin if it's
 * blended in, and that is the exact mistake this rollup exists to
 * prevent.
 */

const BUSINESS_ID = 'biz-fulfillment-accounting-test';
const OTHER_BUSINESS_ID = 'biz-fulfillment-accounting-other';

beforeEach(async () => {
  for (const collection of ['orders', 'fulfillmentBatches', 'domainEvents', 'packages']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

async function seedConfirmedOrder(totalKes: number, overrides: Record<string, unknown> = {}) {
  return seedOrder({
    businessId: BUSINESS_ID,
    status: 'confirmed',
    pricing: { subtotalKes: totalKes, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes },
    ...overrides,
  });
}

describe('getOverview', () => {
  it('reports zeros and full coverage when there is nothing to account for', async () => {
    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.costed).toMatchObject({ orderCount: 0, revenueKes: 0, costKes: 0, grossProfitKes: 0 });
    expect(overview.uncosted).toEqual({ orderCount: 0, revenueKes: 0 });
    // Nothing outstanding is 100% covered, not 0% — the alternative
    // would flag a brand new business as having an accounting problem.
    expect(overview.costCoveragePct).toBe(100);
  });

  it('reports real cost and profit once a batch covers the orders', async () => {
    const first = await seedConfirmedOrder(3000);
    const second = await seedConfirmedOrder(3000);

    await fulfillmentBatchService.createFulfillmentBatch(
      BUSINESS_ID,
      { orderIds: [first, second], productsPurchasedKes: 2000, packagingKes: 400 },
      'staff-1',
    );

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.costed).toMatchObject({
      orderCount: 2,
      revenueKes: 6000,
      costKes: 2400,
      grossProfitKes: 3600,
    });
    expect(overview.costed.marginPct).toBeCloseTo(60, 5);
    expect(overview.batchCount).toBe(1);
    expect(overview.averageBatchCostKes).toBe(2400);
    expect(overview.costCoveragePct).toBe(100);
  });

  it('keeps uncosted revenue out of profit instead of counting it as margin', async () => {
    const batched = await seedConfirmedOrder(3000);
    await fulfillmentBatchService.createFulfillmentBatch(
      BUSINESS_ID,
      { orderIds: [batched], productsPurchasedKes: 1000 },
      'staff-1',
    );
    await seedConfirmedOrder(5000);

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    // Profit is 3000 - 1000, not 8000 - 1000: the uncosted order's
    // revenue is reported separately and never inflates the margin.
    expect(overview.costed).toMatchObject({ orderCount: 1, revenueKes: 3000, costKes: 1000, grossProfitKes: 2000 });
    expect(overview.uncosted).toEqual({ orderCount: 1, revenueKes: 5000 });
    expect(overview.costCoveragePct).toBeCloseTo((3000 / 8000) * 100, 5);
  });

  it('does not count a cancelled or refunded order as an uncosted gap', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled' });
    await seedOrder({ businessId: BUSINESS_ID, status: 'refunded' });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    // No shopping trip is owed against an order that was given back —
    // listing it would be inventing work.
    expect(overview.uncosted).toEqual({ orderCount: 0, revenueKes: 0 });
    expect(overview.oldestUncosted).toEqual([]);
  });

  it('surfaces the longest-waiting uncosted orders first', async () => {
    const nowMs = Date.now();
    const { Timestamp } = await import('firebase-admin/firestore');
    await seedConfirmedOrder(1000, {
      createdAt: Timestamp.fromMillis(nowMs - 2 * 24 * 60 * 60 * 1000),
      customer: { customerId: null, phoneNumber: '254700000001', customerName: 'Recent', county: 'Nairobi' },
    });
    await seedConfirmedOrder(1000, {
      createdAt: Timestamp.fromMillis(nowMs - 9 * 24 * 60 * 60 * 1000),
      customer: { customerId: null, phoneNumber: '254700000002', customerName: 'Oldest', county: 'Nairobi' },
    });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.oldestUncosted.map((order) => order.customerName)).toEqual(['Oldest', 'Recent']);
    expect(overview.oldestUncosted[0].ageDays).toBe(9);
  });

  it('excludes orders outside the reporting window', async () => {
    const { Timestamp } = await import('firebase-admin/firestore');
    await seedConfirmedOrder(4000, {
      createdAt: Timestamp.fromMillis(Date.now() - 45 * 24 * 60 * 60 * 1000),
    });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID, 30);

    expect(overview.uncosted).toEqual({ orderCount: 0, revenueKes: 0 });
  });

  it('never reads another business’s orders or batches', async () => {
    await seedOrder({ businessId: OTHER_BUSINESS_ID, status: 'confirmed' });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.uncosted).toEqual({ orderCount: 0, revenueKes: 0 });
    expect(overview.costed.orderCount).toBe(0);
  });
});

/**
 * Costs recorded straight onto the order by the person who packed it
 * (§ fulfilment records the real cost).
 *
 * This rollup only ever knew about batch allocations, so every figure
 * the warehouse entered was invisible here and its order still counted
 * as an unaccounted gap — the exact opposite of what recording it was
 * for.
 */
describe('costs recorded against the order itself', () => {
  function costs(goodsCostKes: number, otherCostKes: number) {
    return {
      goodsCostKes,
      otherCostKes,
      note: null,
      recordedAt: new Date(),
      recordedBy: 'staff-1',
      recordedByName: 'Boniface',
    };
  }

  it('counts as costed, with the real profit', async () => {
    await seedConfirmedOrder(5000, { costs: costs(1800, 350) });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.costed).toMatchObject({
      orderCount: 1,
      revenueKes: 5000,
      costKes: 2150,
      grossProfitKes: 2850,
    });
    // And crucially not sitting in the gap it used to sit in.
    expect(overview.uncosted).toEqual({ orderCount: 0, revenueKes: 0 });
    expect(overview.costCoveragePct).toBe(100);
  });

  it('still reports an order with no cost of any kind as a gap', async () => {
    await seedConfirmedOrder(5000, { costs: costs(1000, 0) });
    await seedConfirmedOrder(3000);

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.costed.orderCount).toBe(1);
    expect(overview.uncosted).toEqual({ orderCount: 1, revenueKes: 3000 });
    // 5000 of 8000 in-window revenue has a cost behind it.
    expect(overview.costCoveragePct).toBe(62.5);
  });

  /*
   * The precedence that matters. A batch spreads one shopping trip
   * evenly across its orders; `costs` is the real figure from somebody
   * holding the receipts for this box. When both exist the real one
   * wins, and it must not be added to the estimate — that would
   * double-count the same spending.
   */
  it('prefers the recorded cost over a batch allocation, never both', async () => {
    const orderId = await seedConfirmedOrder(6000);
    await fulfillmentBatchService.createFulfillmentBatch(
      BUSINESS_ID,
      { orderIds: [orderId], productsPurchasedKes: 4000, packagingKes: 0 },
      'staff-1',
    );
    // Recorded afterwards, by the person who actually packed it.
    await adminFirestore.collection('orders').doc(orderId).update({ costs: costs(1500, 200) });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.costed.orderCount).toBe(1);
    expect(overview.costed.costKes).toBe(1700);
    expect(overview.costed.grossProfitKes).toBe(4300);
  });
});

/**
 * Which box actually makes money (§ fulfilment records the real cost).
 *
 * The rollup answers "are we making money"; a shop selling two
 * products at very different margins reads the same average whichever
 * one it sells more of, so the average cannot be acted on.
 */
describe('margin by box', () => {
  function costs(goodsCostKes: number) {
    return {
      goodsCostKes,
      otherCostKes: 0,
      note: null,
      recordedAt: new Date(),
      recordedBy: 'staff-1',
      recordedByName: 'Boniface',
    };
  }

  it('separates a profitable box from one losing money', async () => {
    await seedConfirmedOrder(5000, {
      costs: costs(1000),
      product: { packageId: 'premium', packageLabel: 'Premium Box', quantity: 1, unitPriceKes: 5000 },
    });
    await seedConfirmedOrder(2000, {
      costs: costs(2600),
      product: { packageId: 'starter', packageLabel: 'Starter Box', quantity: 1, unitPriceKes: 2000 },
    });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    // Worst first: the box quietly losing money is the one worth
    // finding, and it is never at the top of an alphabetical list.
    expect(overview.byPackage.map((entry) => entry.packageId)).toEqual(['starter', 'premium']);
    expect(overview.byPackage[0]).toMatchObject({ costKes: 2600, grossProfitKes: -600 });
    expect(overview.byPackage[1]).toMatchObject({ costKes: 1000, grossProfitKes: 4000 });
  });

  it('splits a two-box order across both boxes', async () => {
    await seedConfirmedOrder(8000, {
      costs: costs(4000),
      product: {
        packageId: 'premium',
        packageLabel: 'Premium Box',
        quantity: 1,
        unitPriceKes: 5000,
        items: [
          { packageId: 'premium', packageLabel: 'Premium Box', quantity: 1, unitPriceKes: 5000 },
          { packageId: 'starter', packageLabel: 'Starter Box', quantity: 1, unitPriceKes: 3000 },
        ],
      },
    });

    const overview = await fulfillmentAccountingService.getOverview(BUSINESS_ID);

    expect(overview.byPackage).toHaveLength(2);
    // The whole order's cost is accounted for, not half of it.
    expect(overview.byPackage.reduce((sum, entry) => sum + entry.costKes, 0)).toBe(4000);
    expect(overview.byPackage.reduce((sum, entry) => sum + entry.revenueKes, 0)).toBe(8000);
  });
});

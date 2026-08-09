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

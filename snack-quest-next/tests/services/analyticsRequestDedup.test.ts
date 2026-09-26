import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { fulfillmentAccountingService } from '@/services/fulfillmentAccountingService';
import { orderRepository } from '@/repositories/orderRepository';
import { AnalyticsRequestCache, NoRequestCache } from '@/lib/analytics/requestCache';
import { seedOrder } from '../helpers/orderFixtures';
import type { Order } from '@/types';

/**
 * One order read per request, not nine (§ analytics rollups,
 * docs/FLEET_ARCHITECTURE_AUDIT.md finding 2).
 *
 * The admin Analytics page renders fourteen metrics in one
 * `Promise.all`. Nine of them — six on `BusinessAnalyticsService`, one
 * more inside `getCreatorRoi`, and a tenth on
 * `FulfillmentAccountingService` — each independently asked
 * `orderRepository` for the same rows. `AnalyticsRequestCache` is what
 * collapses that: constructed once per request and passed to every
 * metric that accepts it, so the underlying stream runs once and every
 * caller shares its result.
 *
 * The class itself already has a unit-level probe proving React's own
 * `cache()` does *not* dedupe outside a real request scope — that is
 * why this exists as an explicit object instead. What matters here is
 * proving the real services actually share it when given one, and
 * behave exactly as before when they are not.
 */

const BUSINESS_ID = 'biz-dedup-test';

function daysAgo(n: number): Order['createdAt'] {
  return Timestamp.fromMillis(Date.now() - n * 24 * 60 * 60 * 1000) as unknown as Order['createdAt'];
}

beforeEach(async () => {
  for (const collection of [
    'orders',
    'customerLifetime',
    'trafficDaily',
    'referralAttributions',
    'fulfillmentBatches',
    'marketingSpendEntries',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

/** Counts how many times the underlying stream is actually opened, without changing what it returns. */
function spyOnOrderStream() {
  const spy = vi.spyOn(orderRepository, 'streamRange');
  return spy;
}

describe('a shared cache across BusinessAnalyticsService methods', () => {
  it('issues one order read for six metrics that would otherwise each issue their own', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1) });
    const spy = spyOnOrderStream();
    const cache = new AnalyticsRequestCache();

    await Promise.all([
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30, cache),
      businessAnalyticsService.getRevenueByChannel(BUSINESS_ID, 30, cache),
      businessAnalyticsService.getRefundRate(BUSINESS_ID, 30, cache),
      businessAnalyticsService.getRepeatPurchaseRate(BUSINESS_ID, 30, cache),
      businessAnalyticsService.getCreatorRoi(BUSINESS_ID, 30, cache),
      fulfillmentAccountingService.getOverview(BUSINESS_ID, 30, cache),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.readCount).toBe(1);
    spy.mockRestore();
  });

  /*
   * The control. Without a shared cache — the default when no cache
   * is passed, which is how every one of these already behaved and
   * how every existing test still calls them — nothing is deduped.
   * Six calls, six reads. This is what proves the dedup above is real
   * and not an artefact of the methods no longer reading orders at all.
   */
  it('reads once per call when no cache is shared', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1) });
    const spy = spyOnOrderStream();

    await Promise.all([
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30),
      businessAnalyticsService.getRevenueByChannel(BUSINESS_ID, 30),
    ]);

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('produces identical results whether shared or not', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1) });

    const shared = new AnalyticsRequestCache();
    const [withCache, withoutCache] = await Promise.all([
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30, shared),
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30, new NoRequestCache()),
    ]);

    expect(withCache).toEqual(withoutCache);
  });

  /* Different windows are different questions and must not share an answer. */
  it('keys by the window, not just the business', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1) });
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(20) });
    const cache = new AnalyticsRequestCache();

    const [sevenDays, sixtyDays] = await Promise.all([
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 7, cache),
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 60, cache),
    ]);

    expect(sevenDays.orderCount).toBe(1);
    expect(sixtyDays.orderCount).toBe(2);
    expect(cache.readCount).toBe(2);
  });

  it('does not leak one business into another sharing the same cache instance', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1) });
    await seedOrder({ businessId: 'biz-dedup-other', status: 'confirmed', createdAt: daysAgo(1) });
    const cache = new AnalyticsRequestCache();

    const [mine, theirs] = await Promise.all([
      businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30, cache),
      businessAnalyticsService.getRevenueOverview('biz-dedup-other', 30, cache),
    ]);

    expect(mine.orderCount).toBe(1);
    expect(theirs.orderCount).toBe(1);
    expect(cache.readCount).toBe(2);
  });

  /*
   * A failed read must not poison the cache for the next caller in the
   * same request — an outage on one metric should not take the others
   * down with it by handing them a cached rejection forever.
   */
  it('does not cache a failed read', async () => {
    const cache = new AnalyticsRequestCache();
    const spy = spyOnOrderStream().mockImplementation(() => {
      throw new Error('simulated Firestore failure');
    });

    await expect(businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30, cache)).rejects.toThrow();
    spy.mockRestore();

    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: daysAgo(1) });
    const result = await businessAnalyticsService.getRevenueOverview(BUSINESS_ID, 30, cache);
    expect(result.orderCount).toBe(1);
  });
});

describe('a shared cache across getCac, getCacByChannel and getLtv', () => {
  it('rebuilds the customer-lifetime rollup once for all three', async () => {
    await seedOrder({
      businessId: BUSINESS_ID,
      status: 'confirmed',
      createdAt: daysAgo(1),
      customer: {
        customerId: null,
        phoneNumber: '254700000001',
        customerName: 'Test Customer',
        county: 'Nairobi',
      },
    });
    const rebuildSpy = vi.spyOn(
      (await import('@/services/analyticsRollupService')).analyticsRollupService,
      'rebuildCustomerLifetime',
    );
    const cache = new AnalyticsRequestCache();
    const month = new Date().toISOString().slice(0, 7);

    await Promise.all([
      businessAnalyticsService.getCac(BUSINESS_ID, month, cache),
      businessAnalyticsService.getCacByChannel(BUSINESS_ID, month, cache),
      businessAnalyticsService.getLtv(BUSINESS_ID, cache),
    ]);

    expect(rebuildSpy).toHaveBeenCalledTimes(1);
    rebuildSpy.mockRestore();
  });
});

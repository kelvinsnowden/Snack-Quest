import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { analyticsRollupService } from '@/services/analyticsRollupService';
import { trafficDailyRepository } from '@/repositories/trafficDailyRepository';
import { dateKey } from '@/lib/analytics/dateKey';

/**
 * Traffic counted from every page view, not from as many of them as
 * Firestore felt like returning
 * (§ analytics rollups, docs/FLEET_ARCHITECTURE_AUDIT.md finding 4).
 *
 * `pageViewRepository.listSince` capped at 20,000 documents and applied
 * no `orderBy`. Production held 24,740 page views, 21,426 of them in
 * the last thirty days — so Firestore returned an arbitrary 20,000 and
 * the dashboard rendered the total as exact. Nothing warned. Nothing
 * logged. The number was simply wrong, and quietly getting wronger
 * every day.
 *
 * The truncation test below is the one that matters: it seeds more page
 * views than a deliberately tiny cap and asserts the rollup counts all
 * of them. Everything else here guards the arithmetic the rollup has to
 * get right for that to be worth anything — above all that unique
 * visitors over a range is a *union* and not a sum, which is the one
 * figure a daily rollup can most easily get wrong.
 */

const BUSINESS_ID = 'biz-traffic-test';
const DAY = 24 * 60 * 60 * 1000;

function dayAgo(n: number): string {
  return dateKey(new Date(Date.now() - n * DAY));
}

/** A page view at midday on a given day, so no test straddles a UTC boundary. */
async function seedView(daysAgo: number, visitorId: string, path = '/') {
  const date = new Date(Date.now() - daysAgo * DAY);
  date.setUTCHours(12, 0, 0, 0);
  await adminFirestore.collection('pageViews').add({
    businessId: BUSINESS_ID,
    path,
    visitorId,
    referrer: null,
    createdAt: Timestamp.fromDate(date),
  });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('pageViews'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('trafficDaily'));
});

describe('rebuilding one day', () => {
  it('counts visits, unique visitors and paths', async () => {
    await seedView(1, 'v1', '/');
    await seedView(1, 'v1', '/boxes');
    await seedView(1, 'v2', '/');

    const rollup = await analyticsRollupService.rebuildTrafficDay(BUSINESS_ID, dayAgo(1));

    expect(rollup.visits).toBe(3);
    expect(rollup.uniqueVisitors).toBe(2);
    expect(rollup.byPath).toEqual({ '/': 2, '/boxes': 1 });
  });

  it('strips the query string so one page is one page', async () => {
    await seedView(1, 'v1', '/checkout?box=starter');
    await seedView(1, 'v2', '/checkout?box=premium');

    const rollup = await analyticsRollupService.rebuildTrafficDay(BUSINESS_ID, dayAgo(1));

    expect(rollup.byPath).toEqual({ '/checkout': 2 });
  });

  it('is idempotent', async () => {
    await seedView(1, 'v1');
    await analyticsRollupService.rebuildTrafficDay(BUSINESS_ID, dayAgo(1));
    await analyticsRollupService.rebuildTrafficDay(BUSINESS_ID, dayAgo(1));

    const rollups = await trafficDailyRepository.listRange(BUSINESS_ID, dayAgo(1), dayAgo(1));
    expect(rollups.get(dayAgo(1))?.visits).toBe(1);
    expect(await trafficDailyRepository.listVisitorIds(BUSINESS_ID, dayAgo(1))).toEqual(['v1']);
  });

  it('does not count another business', async () => {
    await seedView(1, 'v1');
    await adminFirestore.collection('pageViews').add({
      businessId: 'biz-traffic-other',
      path: '/',
      visitorId: 'v9',
      referrer: null,
      createdAt: Timestamp.fromMillis(Date.now() - DAY),
    });

    const rollup = await analyticsRollupService.rebuildTrafficDay(BUSINESS_ID, dayAgo(1));
    expect(rollup.visits).toBe(1);
  });

  /*
   * The bug, reproduced. `listSince` would return at most `cap` rows
   * for this day; the rollup streams past the cap and counts every one.
   * Twenty-five stands in for twenty thousand — production is at
   * 21,426 against a cap of 20,000, so this is not hypothetical.
   */
  it('counts past the limit that the old scan stopped at', async () => {
    const cap = 25;
    for (let i = 0; i < cap + 7; i += 1) {
      await seedView(1, `visitor-${i}`);
    }

    const truncated = await adminFirestore
      .collection('pageViews')
      .where('businessId', '==', BUSINESS_ID)
      .limit(cap)
      .get();
    expect(truncated.size).toBe(cap);

    const rollup = await analyticsRollupService.rebuildTrafficDay(BUSINESS_ID, dayAgo(1));
    expect(rollup.visits).toBe(cap + 7);
    expect(rollup.uniqueVisitors).toBe(cap + 7);
  });
});

describe('rebuilding a range', () => {
  it('skips today, because today is not over', async () => {
    await seedView(0, 'v-today');
    await seedView(1, 'v-yesterday');

    const result = await analyticsRollupService.rebuildTrafficRange(
      BUSINESS_ID,
      dayAgo(3),
      dayAgo(0),
    );

    expect(result.days).toBe(3);
    const stored = await trafficDailyRepository.listRange(BUSINESS_ID, dayAgo(3), dayAgo(0));
    expect(stored.has(dayAgo(0))).toBe(false);
    expect(stored.get(dayAgo(1))?.visits).toBe(1);
  });

  it('writes a zero for a day with no traffic rather than leaving a hole', async () => {
    await analyticsRollupService.rebuildTrafficRange(BUSINESS_ID, dayAgo(2), dayAgo(1));

    const stored = await trafficDailyRepository.listRange(BUSINESS_ID, dayAgo(2), dayAgo(1));
    expect(stored.get(dayAgo(2))?.visits).toBe(0);
  });
});

describe('getTraffic reading the rollups', () => {
  it('agrees with the raw page views it replaces', async () => {
    await seedView(1, 'v1', '/');
    await seedView(1, 'v2', '/boxes');
    await seedView(2, 'v1', '/');
    await analyticsRollupService.rebuildTrafficRange(BUSINESS_ID, dayAgo(5), dayAgo(1));

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 7);

    expect(traffic.totalVisits).toBe(3);
    expect(traffic.topPages).toEqual([
      { path: '/', visits: 2 },
      { path: '/boxes', visits: 1 },
    ]);
  });

  /*
   * The arithmetic a daily rollup is most likely to get wrong. `v1`
   * visits on two different days: two visitor-days, one visitor. Summing
   * the daily `uniqueVisitors` would say two, and would keep saying two
   * with more and more confidence as the range grew.
   */
  it('unions unique visitors across days instead of summing them', async () => {
    await seedView(1, 'v1');
    await seedView(2, 'v1');
    await seedView(2, 'v2');
    await analyticsRollupService.rebuildTrafficRange(BUSINESS_ID, dayAgo(5), dayAgo(1));

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 7);

    expect(traffic.totalVisits).toBe(3);
    expect(traffic.uniqueVisitors).toBe(2);
  });

  it('includes today, which has no rollup yet', async () => {
    await seedView(1, 'v1');
    await seedView(0, 'v2');
    await analyticsRollupService.rebuildTrafficRange(BUSINESS_ID, dayAgo(5), dayAgo(1));

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 7);

    expect(traffic.totalVisits).toBe(2);
    expect(traffic.uniqueVisitors).toBe(2);
  });

  /*
   * Self-healing. If the nightly job has never run, the numbers must
   * still be right — the read fills the gap and stores it, so the cost
   * is paid once rather than never being paid and the answer being
   * wrong.
   */
  it('computes and stores a day nobody has rolled up yet', async () => {
    await seedView(1, 'v1');
    await seedView(1, 'v2');

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 7);
    expect(traffic.totalVisits).toBe(2);

    const stored = await trafficDailyRepository.listRange(BUSINESS_ID, dayAgo(1), dayAgo(1));
    expect(stored.get(dayAgo(1))?.visits).toBe(2);
  });

  it('reports the previous period for comparison', async () => {
    await seedView(1, 'v1');
    await seedView(9, 'v2');
    await seedView(9, 'v3');
    await analyticsRollupService.rebuildTrafficRange(BUSINESS_ID, dayAgo(20), dayAgo(1));

    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 7);

    expect(traffic.totalVisits).toBe(1);
    expect(traffic.previousPeriod.totalVisits).toBe(2);
    expect(traffic.previousPeriod.uniqueVisitors).toBe(2);
  });

  it('returns a zero-filled series for a business with no traffic', async () => {
    const traffic = await businessAnalyticsService.getTraffic(BUSINESS_ID, 7);

    expect(traffic.totalVisits).toBe(0);
    expect(traffic.uniqueVisitors).toBe(0);
    expect(traffic.days).toHaveLength(7);
    expect(traffic.days.every((d) => d.visits === 0)).toBe(true);
  });
});

describe('getTrafficForRange reading the rollups', () => {
  it('counts an explicit window', async () => {
    await seedView(2, 'v1');
    await seedView(3, 'v2');
    await seedView(10, 'v3');
    await analyticsRollupService.rebuildTrafficRange(BUSINESS_ID, dayAgo(20), dayAgo(1));

    const start = new Date(Date.now() - 4 * DAY);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(Date.now() - 1 * DAY);
    end.setUTCHours(0, 0, 0, 0);

    const traffic = await businessAnalyticsService.getTrafficForRange(BUSINESS_ID, { start, end });

    expect(traffic.totalVisits).toBe(2);
    expect(traffic.uniqueVisitors).toBe(2);
  });
});

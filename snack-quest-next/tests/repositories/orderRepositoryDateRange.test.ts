import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { orderRepository } from '@/repositories/orderRepository';
import { seedOrder } from '../helpers/orderFixtures';
import type { Order } from '@/types';

/**
 * Asking the database for a date window, rather than asking it for a
 * thousand rows and throwing most of them away
 * (§ analytics rollups, docs/FLEET_ARCHITECTURE_AUDIT.md finding 5).
 *
 * Every analytics method took a `days` argument and then did this:
 *
 *     const { orders } = await listByBusiness(businessId, { limit: 1000 });
 *     const inWindow = orders.filter((o) => createdAt >= cutoff);
 *
 * `days` never reached Firestore. At thirty-four orders that is merely
 * wasteful. Past a thousand it is wrong, because the newest thousand
 * rows are not the same set as "every row in this window" — and the
 * metrics that reason about a customer's *first* order cannot see past
 * the window at all.
 *
 * These tests pin the range down at the repository boundary, which is
 * the only place that can actually fix it.
 */

const BUSINESS_ID = 'biz-range-test';
const OTHER_BUSINESS = 'biz-range-other';

function at(daysAgo: number): Order['createdAt'] {
  return Timestamp.fromMillis(
    Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  ) as unknown as Order['createdAt'];
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
});

describe('listByBusiness with a date range', () => {
  it('returns only the orders inside the window', async () => {
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(1) });
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(5) });
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(40) });

    const { orders } = await orderRepository.listByBusiness(BUSINESS_ID, {
      limit: 50,
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    expect(orders).toHaveLength(2);
  });

  /* Half-open, like every other range in this codebase: `since` is in, `until` is out. */
  it('treats the window as [since, until)', async () => {
    const boundary = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await seedOrder({
      businessId: BUSINESS_ID,
      createdAt: Timestamp.fromDate(boundary) as unknown as Order['createdAt'],
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      createdAt: Timestamp.fromMillis(boundary.getTime() - 1) as unknown as Order['createdAt'],
    });

    const onBoundary = await orderRepository.listByBusiness(BUSINESS_ID, {
      limit: 50,
      since: boundary,
    });
    expect(onBoundary.orders).toHaveLength(1);

    const endingOnBoundary = await orderRepository.listByBusiness(BUSINESS_ID, {
      limit: 50,
      since: new Date(0),
      until: boundary,
    });
    expect(endingOnBoundary.orders).toHaveLength(1);
  });

  it('still scopes to the business', async () => {
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(1) });
    await seedOrder({ businessId: OTHER_BUSINESS, createdAt: at(1) });

    const { orders } = await orderRepository.listByBusiness(BUSINESS_ID, {
      limit: 50,
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    expect(orders).toHaveLength(1);
  });

  it('composes with a status filter', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: at(2) });
    await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled', createdAt: at(2) });
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: at(60) });

    const { orders } = await orderRepository.listByBusiness(BUSINESS_ID, {
      limit: 50,
      status: 'confirmed',
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].data.status).toBe('confirmed');
  });

  /*
   * The behaviour that made the old pattern wrong rather than merely
   * slow. Thirty orders, a page size of five: filtering the newest five
   * in memory finds five orders in the window, because it never sees
   * the other twenty-five. Streaming the range finds all thirty.
   *
   * Five stands in for a thousand here for the obvious practical
   * reason; the failure is identical in shape, and the production
   * collection is one order of magnitude from reaching it.
   */
  it('finds orders the newest-N-then-filter approach cannot see', async () => {
    for (let i = 0; i < 30; i += 1) {
      await seedOrder({ businessId: BUSINESS_ID, createdAt: at(i) });
    }
    const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;

    const newestFive = await orderRepository.listByBusiness(BUSINESS_ID, { limit: 5 });
    const filteredInMemory = newestFive.orders.filter(
      (o) => (o.data.createdAt as unknown as Timestamp).toMillis() >= cutoff,
    );
    expect(filteredInMemory).toHaveLength(5);

    const streamed: string[] = [];
    for await (const { id } of orderRepository.streamRange(BUSINESS_ID, {
      since: new Date(cutoff),
      pageSize: 5,
    })) {
      streamed.push(id);
    }
    expect(streamed).toHaveLength(30);
  });
});

describe('streamRange', () => {
  /*
   * The primitive the analytics service aggregates over. Cursor-paged
   * rather than capped, so there is no limit to silently exceed: the
   * caller keeps accumulators, not rows, and the window is the bound.
   */
  it('yields every order in the window, across pages', async () => {
    for (let i = 0; i < 14; i += 1) {
      await seedOrder({ businessId: BUSINESS_ID, createdAt: at(i) });
    }
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(90) });

    const seen: string[] = [];
    for await (const { id } of orderRepository.streamRange(BUSINESS_ID, {
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      pageSize: 4,
    })) {
      seen.push(id);
    }

    expect(seen).toHaveLength(14);
    expect(new Set(seen).size).toBe(14);
  });

  it('respects the status filter', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed', createdAt: at(1) });
    await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled', createdAt: at(1) });

    const seen: Order['status'][] = [];
    for await (const { data } of orderRepository.streamRange(BUSINESS_ID, {
      status: 'confirmed',
      pageSize: 10,
    })) {
      seen.push(data.status);
    }

    expect(seen).toEqual(['confirmed']);
  });
});

describe('countInRange', () => {
  /*
   * A count that does not read the documents. This is what lets a
   * metric answer "how many orders in this window" without the
   * thousand-row scan, and it is the shape every fleet-level counter
   * will reuse.
   */
  it('counts without paying for the rows', async () => {
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(1) });
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(2) });
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(90) });

    const count = await orderRepository.countInRange(BUSINESS_ID, {
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    expect(count).toBe(2);
  });

  it('counts the whole collection when given no bounds', async () => {
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(1) });
    await seedOrder({ businessId: BUSINESS_ID, createdAt: at(400) });

    expect(await orderRepository.countInRange(BUSINESS_ID, {})).toBe(2);
  });
});

describe('streamAll', () => {
  /*
   * The full-dataset read, paged, for the jobs that genuinely need
   * every row — the nightly rollup rebuild being the one that exists
   * today. Deliberately not exposed to request handlers: it is
   * unbounded by construction, which is safe in a cron and never safe
   * on a page load.
   */
  it('yields every order regardless of page size', async () => {
    for (let i = 0; i < 12; i += 1) {
      await seedOrder({ businessId: BUSINESS_ID, createdAt: at(i) });
    }

    const seen: string[] = [];
    for await (const { id } of orderRepository.streamAll(BUSINESS_ID, { pageSize: 5 })) {
      seen.push(id);
    }

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it('yields nothing for a business with no orders', async () => {
    const seen: string[] = [];
    for await (const order of orderRepository.streamAll(OTHER_BUSINESS, { pageSize: 5 })) {
      seen.push(order.id);
    }
    expect(seen).toEqual([]);
  });
});

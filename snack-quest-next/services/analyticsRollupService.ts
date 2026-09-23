import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { orderRepository } from '@/repositories/orderRepository';
import { pageViewRepository } from '@/repositories/pageViewRepository';
import { customerLifetimeRepository } from '@/repositories/customerLifetimeRepository';
import { trafficDailyRepository } from '@/repositories/trafficDailyRepository';
import { deriveOrderChannel, isRealisedRevenue } from '@/services/businessAnalyticsService';
import { toMillis } from '@/lib/firestoreTimestamp';
import { dateKey, dayBounds } from '@/lib/analytics/dateKey';
import type { CustomerLifetime } from '@/types';

/**
 * The read models the admin analytics are computed from
 * (§ analytics rollups, docs/FLEET_ARCHITECTURE_AUDIT.md §5).
 *
 * Two facts drove this into existence. Reading a month of traffic meant
 * reading 20,000 page-view documents — and there were 21,426 in the
 * window, against a query capped at 20,000 with no ordering, so the
 * number on the screen was computed from an arbitrary sample and
 * labelled exact. Separately, "when did this customer first buy from
 * us" was being inferred from the newest thousand orders, which is a
 * question a window cannot answer at all.
 *
 * Both are fixed the same way: compute the expensive thing once, off
 * the request path, and store the answer. Raw `orders` and `pageViews`
 * remain the source of truth and nothing is deleted — these are
 * derived documents that can be thrown away and rebuilt at any time.
 *
 * Rebuilds are idempotent by construction: each one recomputes a whole
 * unit (one business's customers, or one business-day of traffic) and
 * replaces it, rather than incrementing counters that would drift if a
 * job ran twice. That property is the reason this can be run from a
 * cron, from a backfill script, and lazily on read, without any of
 * them having to know about the others.
 */

/** Page views are streamed in pages of this size during a rebuild — bounded memory, no query cap. */
const PAGE_VIEW_PAGE_SIZE = 2000;
const ORDER_PAGE_SIZE = 500;

export interface TrafficDayRollup {
  date: string;
  visits: number;
  uniqueVisitors: number;
  byPath: Record<string, number>;
}

class AnalyticsRollupService {
  /**
   * Recompute every customer's lifetime from `orders`.
   *
   * A full walk rather than an incremental update, deliberately: an
   * order's *status* can change long after it was created, and a
   * cancellation or refund has to be able to remove revenue that a
   * previous run counted. An incremental job keyed on `createdAt`
   * would never see that, and the rollup would drift upward forever
   * with no way to notice.
   *
   * The cost is one paged read of the business's orders, once a night.
   * At the volume this becomes expensive — six figures of orders — the
   * fix is to key the walk on `updatedAt` and merge, not to make this
   * run less often.
   */
  async rebuildCustomerLifetime(businessId: string): Promise<{ customerCount: number }> {
    const byPhone = new Map<string, CustomerLifetime>();

    for await (const { data } of orderRepository.streamAll(businessId, {
      pageSize: ORDER_PAGE_SIZE,
    })) {
      if (!isRealisedRevenue(data)) {
        continue;
      }
      const phone = data.customer.phoneNumber;
      const createdAt = Timestamp.fromMillis(toMillis(data.createdAt));
      const existing = byPhone.get(phone);

      if (!existing) {
        byPhone.set(phone, {
          businessId,
          phoneNumber: phone,
          customerName: data.customer.customerName,
          firstOrderAt: createdAt,
          lastOrderAt: createdAt,
          firstOrderChannel: deriveOrderChannel(data),
          orderCount: 1,
          totalRevenueKes: data.pricing.totalKes,
          rebuiltAt: createdAt,
        });
        continue;
      }

      existing.orderCount += 1;
      existing.totalRevenueKes += data.pricing.totalKes;
      if (createdAt.toMillis() < existing.firstOrderAt.toMillis()) {
        existing.firstOrderAt = createdAt;
        /* Acquisition belongs to the channel of the *first* order, so this moves with it. */
        existing.firstOrderChannel = deriveOrderChannel(data);
      }
      if (createdAt.toMillis() > existing.lastOrderAt.toMillis()) {
        existing.lastOrderAt = createdAt;
        existing.customerName = data.customer.customerName;
      }
    }

    const customers = Array.from(byPhone.values());
    await customerLifetimeRepository.replaceAll(businessId, customers);
    return { customerCount: customers.length };
  }

  /**
   * Compute one day of traffic from raw page views, without storing it.
   *
   * Split out from `rebuildTrafficDay` because the current day is read
   * this way on every request — today's rows are still arriving, so a
   * stored rollup for it would be wrong the moment after it was
   * written. One day of traffic is a bounded read; sixty days was not,
   * which is what the old code did on every dashboard load.
   */
  async computeTrafficDay(
    businessId: string,
    date: string,
  ): Promise<{ rollup: TrafficDayRollup; visitorIds: string[] }> {
    const { start, end } = dayBounds(date);
    const byPath: Record<string, number> = {};
    const visitors = new Set<string>();
    let visits = 0;

    for await (const view of pageViewRepository.streamRange(businessId, start, end, {
      pageSize: PAGE_VIEW_PAGE_SIZE,
    })) {
      visits += 1;
      visitors.add(view.visitorId);
      const path = (view.path ?? '').split('?')[0];
      byPath[path] = (byPath[path] ?? 0) + 1;
    }

    return {
      rollup: { date, visits, uniqueVisitors: visitors.size, byPath },
      visitorIds: Array.from(visitors),
    };
  }

  /** Compute one completed day and store it. */
  async rebuildTrafficDay(businessId: string, date: string): Promise<TrafficDayRollup> {
    const { rollup, visitorIds } = await this.computeTrafficDay(businessId, date);
    await trafficDailyRepository.put(
      businessId,
      date,
      { visits: rollup.visits, uniqueVisitors: rollup.uniqueVisitors, byPath: rollup.byPath },
      visitorIds,
    );
    return rollup;
  }

  /**
   * Rebuild every completed day in `[startDate, endDate]`.
   *
   * Today is skipped rather than rolled up: it is still accumulating,
   * and a rollup that says "complete" about an incomplete day is the
   * same class of quiet wrongness this whole change exists to remove.
   */
  async rebuildTrafficRange(
    businessId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ days: number; visits: number }> {
    const today = dateKey(new Date());
    let days = 0;
    let visits = 0;

    for (const date of datesBetween(startDate, endDate)) {
      if (date >= today) {
        continue;
      }
      const rollup = await this.rebuildTrafficDay(businessId, date);
      days += 1;
      visits += rollup.visits;
    }

    return { days, visits };
  }
}

/** Inclusive `YYYY-MM-DD` walk, UTC. */
function* datesBetween(startDate: string, endDate: string): Generator<string> {
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    yield dateKey(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export const analyticsRollupService = new AnalyticsRollupService();
export { AnalyticsRollupService, datesBetween };

import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import type { AnalyticsRequestCache } from './requestCache';
import type { Order } from '@/types';

/**
 * The one order read six-to-seven analytics metrics were each doing
 * for themselves (§ analytics rollups,
 * docs/FLEET_ARCHITECTURE_AUDIT.md finding 2).
 *
 * `getRevenueOverview`, `getWebFunnel`, `getRevenueByChannel`,
 * `getCreatorRoi`, `getRefundRate`, `getRepeatPurchaseRate` and
 * `FulfillmentAccountingService.getOverview` all asked
 * `orderRepository.listByBusiness(businessId, { limit: 1000 })` for
 * the same rows, independently, every time the admin Analytics page
 * rendered — nine identical queries, nine round trips, nine
 * deserialisations of one answer, all inside one `Promise.all`.
 *
 * This is the shared read they now go through instead, and it fixes
 * the other half of the same bug at once: rather than a fixed count
 * capped at 1000, it asks Firestore for a date range and pages until
 * the range is exhausted (`orderRepository.streamRange`), so "how many
 * orders is `days` supposed to reach" is answered by the calendar, not
 * by however many orders happen to exist.
 *
 * Fetches twice the requested window so a caller that needs a
 * comparison against the immediately preceding period of equal length
 * (`getRevenueOverview` is the one that does) finds it already loaded,
 * without a second read. A caller with no previous-period comparison
 * simply filters the extra rows away, which costs nothing once they
 * are already in memory.
 *
 * Cached per request by `days`, not by an exact `since` instant: every
 * caller in one render passes the same `days`, and keying on the
 * millisecond `Date.now()` each one happens to compute would give each
 * of them its own cache entry and defeat the whole point. The
 * documents themselves are unaffected — a few milliseconds of clock
 * drift between callers in the same render changes nothing a
 * day-granularity metric reports.
 */
export async function loadOrdersInWindow(
  businessId: string,
  days: number,
  cache: AnalyticsRequestCache,
): Promise<{ id: string; data: Order }[]> {
  return cache.memo(`orders-window:${businessId}:${days}`, async () => {
    const since = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);
    const orders: { id: string; data: Order }[] = [];
    for await (const order of orderRepository.streamRange(businessId, { since })) {
      orders.push(order);
    }
    return orders;
  });
}

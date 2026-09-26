import 'server-only';

import { conversationRepository } from '@/repositories/conversationRepository';
import { referralAttributionRepository } from '@/repositories/referralAttributionRepository';
import { userRepository } from '@/repositories/userRepository';
import { marketingSpendRepository } from '@/repositories/marketingSpendRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { pageViewRepository } from '@/repositories/pageViewRepository';
import { analyticsEventRepository } from '@/repositories/analyticsEventRepository';
import { FUNNEL_EVENTS } from '@/lib/analytics/funnelEvents';
import { isComplimentaryBox } from '@/lib/analytics/complimentaryOrder';
import { refundRepository } from '@/repositories/refundRepository';
import { customerLifetimeRepository } from '@/repositories/customerLifetimeRepository';
import { trafficDailyRepository } from '@/repositories/trafficDailyRepository';
import { analyticsRollupService } from '@/services/analyticsRollupService';
import { dateKey, monthBounds } from '@/lib/analytics/dateKey';
import { AnalyticsRequestCache, NoRequestCache } from '@/lib/analytics/requestCache';
import { loadOrdersInWindow } from '@/lib/analytics/ordersWindow';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { toMillis } from '@/lib/firestoreTimestamp';
import { SHIPMENT_STATUS_LABELS } from '@/lib/delivery/transitions';
import type { Order, ShipmentStatus, TrafficDaily } from '@/types';

/**
 * Real analytics, derived from the same collections the rest of the
 * Admin Portal already reads (§ Admin: Analytics) — no separate
 * analytics pipeline or warehouse, since none is justified at this
 * business's scale yet.
 *
 * Two different disciplines live here now, and the split is
 * deliberate (§ analytics rollups, docs/FLEET_ARCHITECTURE_AUDIT.md).
 * Anything that answers "in the last N days" — revenue, refunds,
 * repeat purchase, channel split, creator ROI — reads orders by date
 * range (`loadOrdersInWindow`, shared per request through an
 * `AnalyticsRequestCache`), never by a fixed count: a `limit(1000)`
 * scan is correct only until the business has more than 1000 orders,
 * and fails by quietly reporting a better number than the truth
 * rather than by erroring.
 *
 * Anything that answers a *lifetime* question instead — a customer's
 * first-ever order, which `getLtv`/`getCac`/`getCacByChannel` all
 * turn on — cannot be answered from any window at all, however wide.
 * Those read `customerLifetime`, a rollup rebuilt from every order
 * the business has ever taken. Website traffic has the same shape of
 * problem at a much larger volume (page views outnumber orders by
 * three orders of magnitude) and the same fix: `trafficDaily`, one
 * document per business per day, read instead of a raw scan of
 * `pageViews`.
 *
 * CAC is the one metric with no automatic data source: this codebase
 * has no ad-spend-reporting integration (Meta Conversion API sends
 * events *to* Meta for ad optimization; it does not report spend
 * back). `getCac()` is computed from a manually-entered monthly spend
 * figure (`marketingSpendRepository`) — real, not fabricated, but
 * only as accurate as what's entered.
 */
const FUNNEL_CONVERSATION_LIMIT = 500;
const COMMISSION_ATTRIBUTION_LIMIT = 500;
const SHIPMENT_ANALYTICS_LIMIT = 500;
const TOP_PAGES_LIMIT = 10;
const REFUND_SCAN_LIMIT = 1000;
const PAYMENT_INTENT_SCAN_LIMIT = 500;
const TOP_CREATORS_ROI_LIMIT = 10;

// Orders that represent real, kept revenue — excludes pending (not
// yet a completed sale), cancelled, and refund_requested (money that
// was or will be given back).
const REVENUE_STATUSES: Order['status'][] = ['confirmed', 'dispatched', 'delivered'];

/**
 * Money actually taken, which is not the same question as the order's
 * status (§ pay on delivery).
 *
 * A pay-on-delivery order is `confirmed` from the moment it is taken —
 * it is real, and it gets packed and delivered like any other — but
 * nothing has been collected for it. Counting it as revenue would
 * report money the shop does not have, and would keep reporting it if
 * the customer refused the box at the door.
 *
 * `dueOnDelivery` is absent on every order that predates it and on
 * every order paid up front, which is why the test is for the flag
 * being set rather than for its absence.
 *
 * A comped PR box fails for the same reason and does more damage than
 * a pay-on-delivery one, because it is not merely absent from the
 * revenue total — it adds nothing to the numerator while adding one to
 * every denominator. Seven of them dragged the average order value
 * from KSh 4,259 down to KSh 2,603, made seven recipients look like
 * customers worth nothing each in the LTV figure, and put seven
 * payments in the bottom of the checkout funnel that nobody made.
 */
export function isRealisedRevenue(order: Order): boolean {
  return (
    REVENUE_STATUSES.includes(order.status) &&
    order.payment?.dueOnDelivery !== true &&
    !isComplimentaryBox(order)
  );
}

/**
 * A comped box that was really sent, so it is worth counting — just
 * not as revenue.
 *
 * Excluded from every average and reported on its own instead. These
 * cost real stock, and a giveaway that vanishes from the numbers is a
 * cost nobody can see; the point is to separate them, not to lose
 * them.
 */
function isCountedComplimentary(order: Order): boolean {
  return REVENUE_STATUSES.includes(order.status) && isComplimentaryBox(order);
}

/**
 * Which ad/acquisition channel an order came from (§ close the loop:
 * ad-conversion attribution), derived the same way
 * `AdConversionService.dispatchPurchase` decides where to report a
 * purchase — a creator referral code takes priority over an ad click
 * id (a customer can arrive via both; the referral is the one that
 * actually earns a commission and is the more specific signal),
 * `ttclid`/`fbclid` identify the ad platform, `channel: 'web'` with
 * neither is a real website visit with no tracked ad behind it, and
 * no `attribution` at all means a native WhatsApp-originated order
 * (§ Website Becomes the Primary Commerce Channel notwithstanding —
 * old orders and any that slip through the same shared conversation
 * flow without ever hitting web checkout still count honestly here).
 */
export type OrderChannel = 'referral' | 'tiktok' | 'meta' | 'organic-web' | 'other';

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  referral: 'Creator referral',
  tiktok: 'TikTok ads',
  meta: 'Meta ads',
  'organic-web': 'Website (no ad)',
  other: 'Other / WhatsApp',
};

/**
 * Every calendar date (UTC, `YYYY-MM-DD`) touched by the half-open
 * interval `[start, end)` — used to seed `getTrafficForRange`'s
 * day buckets so a day with zero views still shows up as a zero,
 * not a gap in the chart.
 */
function dateKeysBetween(start: Date, end: Date): string[] {
  const lastMs = Math.max(start.getTime(), end.getTime() - 1);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const lastKey = new Date(lastMs).toISOString().slice(0, 10);

  const keys: string[] = [];
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    keys.push(key);
    if (key >= lastKey) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function deriveOrderChannel(order: Order): OrderChannel {
  if (order.referralLinkId) {
    return 'referral';
  }
  const attribution = order.attribution as { channel?: string; ttclid?: string; fbclid?: string } | null;
  if (attribution?.ttclid) {
    return 'tiktok';
  }
  if (attribution?.fbclid) {
    return 'meta';
  }
  if (attribution?.channel === 'web') {
    return 'organic-web';
  }
  return 'other';
}

export interface RevenueDay {
  date: string;
  revenueKes: number;
  orderCount: number;
}

export interface TrafficDay {
  date: string;
  visits: number;
  uniqueVisitors: number;
}

export interface TopPage {
  path: string;
  visits: number;
}

export interface TrafficOverview {
  totalVisits: number;
  uniqueVisitors: number;
  days: TrafficDay[];
  topPages: TopPage[];
  /** The equal-length window immediately before this one, same reasoning as `RevenueOverview.previousPeriod`. */
  previousPeriod: {
    totalVisits: number;
    uniqueVisitors: number;
  };
}

export interface TrafficDateRange {
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface RevenueOverview {
  totalRevenueKes: number;
  orderCount: number;
  averageOrderValueKes: number;
  days: RevenueDay[];
  /** The equal-length window immediately before this one — e.g. days 31–60 ago when `days` is 30 — for a real "vs last period" comparison, not a fabricated trend. */
  previousPeriod: {
    totalRevenueKes: number;
    orderCount: number;
  };
  /**
   * Boxes given away in the window, kept out of every figure above and
   * reported here instead (§ separate PR boxes from revenue and
   * averages).
   *
   * Reported rather than dropped because they are a real cost: seven
   * PR boxes went out on 1 September carrying about KSh 30,500 of
   * stock at list price. Netting them out of revenue but leaving them
   * invisible would trade one wrong number for another.
   */
  complimentary: {
    orderCount: number;
    /** What the boxes in them would have sold for, before the code took it to zero. Delivery is excluded, so this is the stock given away and not the total cost of giving it. */
    goodsAtListKes: number;
  };
}

export interface FunnelStage {
  step: string;
  count: number;
}

/**
 * The website's own purchase funnel (§ web funnel in Admin analytics).
 *
 * `getFunnel` measures WhatsApp conversations, which is a different
 * journey entirely and says nothing about the path almost every
 * visitor actually takes. The numbers below had to be read out of
 * server logs to answer "where do people stop" — and the events they
 * are built from were already being written and never read by
 * anything.
 */
export interface WebFunnel {
  stages: FunnelStage[];
  /** People behind the quotes, as opposed to quotes served — a customer re-pricing their options produces several. */
  quotedVisitors: number;
  /** Orders started in a WhatsApp thread instead. Not a funnel stage: it leaves the site, and what follows is invisible from here. */
  whatsappOrdersStarted: number;
  days: number;
}

export interface CreatorPerformance {
  creatorId: string;
  displayName: string;
  conversions: number;
  commissionKes: number;
}

export interface CacResult {
  month: string;
  spendKes: number | null;
  newCustomers: number;
  cacKes: number | null;
}

export interface ChannelCacResult {
  channel: 'meta' | 'tiktok';
  month: string;
  spendKes: number | null;
  newCustomers: number;
  cacKes: number | null;
}

export interface ChannelRevenue {
  channel: OrderChannel;
  orderCount: number;
  revenueKes: number;
}

export interface RevenueByChannelResult {
  days: number;
  channels: ChannelRevenue[];
}

export interface CreatorRoi {
  creatorId: string;
  displayName: string;
  orderCount: number;
  revenueKes: number;
  commissionKes: number;
  /** `revenueKes / commissionKes`, e.g. 5 means every KES 1 paid in commission drove KES 5 of revenue. Null when no commission has been paid yet — never a fabricated infinity. */
  roi: number | null;
}

export interface RefundRateResult {
  days: number;
  orderCount: number;
  refundedOrderCount: number;
  revenueKes: number;
  refundedAmountKes: number;
  /** 0 when there's no revenue in the window, never a division-by-zero NaN. */
  refundRatePct: number;
}

export interface RepeatPurchaseResult {
  days: number;
  customerCount: number;
  repeatCustomerCount: number;
  /** 0 when there are no customers in the window. */
  repeatRatePct: number;
}

export interface CheckoutAbandonmentResult {
  days: number;
  /** Every payment intent (STK push attempt) created in the window. */
  totalIntents: number;
  succeededIntents: number;
  /** Failed, expired, or still stuck pending/processing past the window — every intent that never became a real order. */
  abandonedIntents: number;
  /** 0 when there are no intents in the window. */
  abandonmentRatePct: number;
}

export interface LtvResult {
  /** All-time, not windowed — a customer's *total* revenue to date is the only honest reading of "lifetime" this early in the business. */
  customerCount: number;
  totalRevenueKes: number;
  /** `totalRevenueKes / customerCount` — average revenue per customer *to date*, not a predictive/discounted LTV model. Rounds down; 0 when there are no customers yet. */
  averageRevenueKes: number;
}

export interface DeliveryStatusCount {
  status: ShipmentStatus;
  label: string;
  count: number;
}

export interface DeliveryMethodCount {
  method: string;
  count: number;
}

export interface DeliveryPerformance {
  totalShipments: number;
  statusBreakdown: DeliveryStatusCount[];
  methodBreakdown: DeliveryMethodCount[];
  deliveredCount: number;
  failedCount: number;
  /** Median hours from shipment creation to delivery, across delivered shipments in this scan window — median rather than mean since one very slow (or very fast) delivery shouldn't dominate the figure. Null until at least one shipment has actually been delivered. */
  medianDeliveryHours: number | null;
}

class BusinessAnalyticsService {
  /**
   * `cache` is optional and defaults to a scope that shares nothing —
   * every method here is correct and independently testable called on
   * its own. The admin Analytics page passes one real
   * `AnalyticsRequestCache` to every metric in its `Promise.all`, and
   * that is what collapses six identical order reads into one.
   */
  async getRevenueOverview(
    businessId: string,
    days = 30,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<RevenueOverview> {
    const orders = await loadOrdersInWindow(businessId, days, cache);
    const windowMs = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const previousCutoff = cutoff - windowMs;

    const inWindow = orders.filter(
      (o) => isRealisedRevenue(o.data) && toMillis(o.data.createdAt) >= cutoff,
    );
    // Reuses the same date-bounded read as `inWindow` rather than a
    // second query — `loadOrdersInWindow` already fetches twice the
    // requested window for exactly this comparison.
    const inPreviousWindow = orders.filter(
      (o) =>
        isRealisedRevenue(o.data) &&
        toMillis(o.data.createdAt) >= previousCutoff &&
        toMillis(o.data.createdAt) < cutoff,
    );

    const byDay = new Map<string, RevenueDay>();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      byDay.set(date, { date, revenueKes: 0, orderCount: 0 });
    }

    let totalRevenueKes = 0;
    for (const { data } of inWindow) {
      const date = new Date(toMillis(data.createdAt)).toISOString().slice(0, 10);
      const bucket = byDay.get(date);
      totalRevenueKes += data.pricing.totalKes;
      if (bucket) {
        bucket.revenueKes += data.pricing.totalKes;
        bucket.orderCount += 1;
      }
    }

    const previousTotalRevenueKes = inPreviousWindow.reduce((sum, o) => sum + o.data.pricing.totalKes, 0);

    // Counted from the same scan and the same window as the revenue
    // above, so the two always describe the same period.
    const compedInWindow = orders.filter(
      (o) => isCountedComplimentary(o.data) && toMillis(o.data.createdAt) >= cutoff,
    );

    return {
      totalRevenueKes,
      orderCount: inWindow.length,
      averageOrderValueKes: inWindow.length > 0 ? Math.round(totalRevenueKes / inWindow.length) : 0,
      days: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      previousPeriod: {
        totalRevenueKes: previousTotalRevenueKes,
        orderCount: inPreviousWindow.length,
      },
      complimentary: {
        orderCount: compedInWindow.length,
        goodsAtListKes: compedInWindow.reduce((sum, o) => sum + o.data.pricing.subtotalKes, 0),
      },
    };
  }

  /**
   * Website traffic (§ Admin: Analytics, website traffic) — real page
   * views from `PageViewTracker.tsx`'s beacon, not a fabricated or
   * estimated number. "Unique visitors" counts distinct
   * `visitorId` cookies, which undercounts anyone who cleared cookies
   * or switched devices — the same honest caveat every cookie-based
   * visitor count carries, not specific to this one.
   */
  async getTraffic(businessId: string, days = 30): Promise<TrafficOverview> {
    const end = new Date();
    // Midnight-aligned, not "now minus days*24h": the rollups this
    // reads are one document per *calendar* day, so the window has to
    // be calendar days too, or the boundary day gets counted twice —
    // once by the day it falls in from midnight, once by however much
    // of it the raw millisecond subtraction reached. Anchoring `start`
    // to midnight of the day `days - 1` days ago gives exactly `days`
    // calendar days ending today, matching what the byDay chart has
    // always shown.
    const start = new Date(
      `${dateKey(new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000))}T00:00:00.000Z`,
    );
    return this.trafficBetween(businessId, start, end);
  }

  /**
   * Same as `getTraffic`, but for an explicit window that doesn't
   * necessarily end "now" — backs the admin Analytics page's
   * day/week/month/custom-range traffic filter
   * (`lib/analytics/trafficRange.ts` resolves the query params into the
   * `range` passed here).
   */
  async getTrafficForRange(businessId: string, range: TrafficDateRange): Promise<TrafficOverview> {
    return this.trafficBetween(businessId, range.start, range.end);
  }

  /**
   * Traffic for `[start, end)`, read from the daily rollups
   * (§ analytics rollups).
   *
   * What this replaces: a scan of every page view in the window, capped
   * at 20,000 rows with no ordering. Production had 21,426 in the last
   * thirty days, so Firestore returned an arbitrary subset and the page
   * reported it as the total. Reading one small document per day counts
   * every view instead, and a month costs thirty documents rather than
   * twenty thousand.
   *
   * Three things this has to get right, each of which a naive rollup
   * gets wrong:
   *
   *   - **Today has no rollup**, because today is not over. Its rows are
   *     read raw — one day's traffic, which is bounded, rather than
   *     sixty days of it.
   *   - **Unique visitors is a union, not a sum.** Somebody who visits
   *     on two days is one visitor for the range. The daily documents
   *     carry counts; the visitor ids live in shards beside them, and
   *     those are what get unioned.
   *   - **A missing day is not a quiet day.** Any completed day without
   *     a rollup is computed and stored on the spot, so the answer is
   *     right even if the nightly job has never run.
   */
  private async trafficBetween(
    businessId: string,
    start: Date,
    end: Date,
  ): Promise<TrafficOverview> {
    const windowMs = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - windowMs);

    const [current, previous] = await Promise.all([
      this.readTrafficWindow(businessId, start, end),
      this.readTrafficWindow(businessId, previousStart, start),
    ]);

    const byDay = new Map<string, { date: string; visits: number; uniqueVisitors: number }>();
    for (const date of dateKeysBetween(start, end)) {
      byDay.set(date, { date, visits: 0, uniqueVisitors: 0 });
    }
    for (const day of current.days) {
      const bucket = byDay.get(day.date);
      if (bucket) {
        bucket.visits = day.visits;
        bucket.uniqueVisitors = day.uniqueVisitors;
      }
    }

    const topPages = Object.entries(current.byPath)
      .map(([path, visits]) => ({ path, visits }))
      .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path))
      .slice(0, TOP_PAGES_LIMIT);

    return {
      totalVisits: current.visits,
      uniqueVisitors: current.visitors.size,
      days: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      topPages,
      previousPeriod: {
        totalVisits: previous.visits,
        uniqueVisitors: previous.visitors.size,
      },
    };
  }

  /** One window's totals, assembled from stored rollups plus today's live rows. */
  private async readTrafficWindow(
    businessId: string,
    start: Date,
    end: Date,
  ): Promise<{
    visits: number;
    visitors: Set<string>;
    byPath: Record<string, number>;
    days: { date: string; visits: number; uniqueVisitors: number }[];
  }> {
    const dates = dateKeysBetween(start, end);
    const today = dateKey(new Date());
    const completed = dates.filter((date) => date < today);

    const stored: Map<string, TrafficDaily> = completed.length
      ? await trafficDailyRepository.listRange(
          businessId,
          completed[0],
          completed[completed.length - 1],
        )
      : new Map<string, TrafficDaily>();

    const visits = { total: 0 };
    const visitors = new Set<string>();
    const byPath: Record<string, number> = {};
    const days: { date: string; visits: number; uniqueVisitors: number }[] = [];

    for (const date of completed) {
      let rollup = stored.get(date);
      if (!rollup) {
        // Never rolled up: build it now and keep it, rather than
        // reporting a zero for a day that had traffic.
        await analyticsRollupService.rebuildTrafficDay(businessId, date);
        const refreshed = await trafficDailyRepository.listRange(businessId, date, date);
        rollup = refreshed.get(date);
      }
      if (!rollup) {
        continue;
      }
      visits.total += rollup.visits;
      for (const [path, count] of Object.entries(rollup.byPath ?? {})) {
        byPath[path] = (byPath[path] ?? 0) + count;
      }
      days.push({ date, visits: rollup.visits, uniqueVisitors: rollup.uniqueVisitors });

      if (rollup.visitorShardCount > 0) {
        for (const id of await trafficDailyRepository.listVisitorIds(businessId, date)) {
          visitors.add(id);
        }
      }
    }

    // Today, if the window reaches it — computed live, never stored.
    if (dates.includes(today) && end.getTime() > Date.now() - 24 * 60 * 60 * 1000) {
      const { rollup, visitorIds } = await analyticsRollupService.computeTrafficDay(
        businessId,
        today,
      );
      visits.total += rollup.visits;
      for (const [path, count] of Object.entries(rollup.byPath)) {
        byPath[path] = (byPath[path] ?? 0) + count;
      }
      for (const id of visitorIds) {
        visitors.add(id);
      }
      days.push({ date: today, visits: rollup.visits, uniqueVisitors: rollup.uniqueVisitors });
    }

    return { visits: visits.total, visitors, byPath, days };
  }

  /**
   * A real funnel from what conversations actually recorded — not
   * every step in the state machine, just the milestones a business
   * cares about the drop-off between.
   */
  async getFunnel(businessId: string): Promise<FunnelStage[]> {
    const { conversations } = await conversationRepository.listByBusiness(businessId, {
      limit: FUNNEL_CONVERSATION_LIMIT,
    });

    const started = conversations.length;
    const selectedPackage = conversations.filter((c) => Boolean(c.data.stateBlob.packageId)).length;
    const selectedDelivery = conversations.filter((c) => Boolean(c.data.stateBlob.deliveryMethod)).length;
    const completed = conversations.filter((c) => c.data.status === 'completed').length;

    return [
      { step: 'Started a conversation', count: started },
      { step: 'Selected a box', count: selectedPackage },
      { step: 'Chose a delivery method', count: selectedDelivery },
      { step: 'Completed purchase', count: completed },
    ];
  }

  /**
   * Where visitors actually stop, on the website (§ web funnel in
   * Admin analytics).
   *
   * Page views carry the two browsing stages; the funnel events carry
   * the two intent stages; orders close it. Deliberately counts
   * *visitors* at the browsing steps and *events* at "quotes served",
   * because those answer different questions — how many people got
   * this far, versus how many times the price was recomputed — and
   * quietly mixing them is how a funnel ends up with a stage that
   * exceeds the one above it.
   */
  async getWebFunnel(
    businessId: string,
    days = 30,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<WebFunnel> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    /*
     * `streamRange`, not `listSince` (§ analytics rollups). `listSince`
     * caps at 20,000 with no ordering, and the 30-day window this
     * funnel is asked for has matched as many as 21,426 page views in
     * production — so the capped call would silently drop whichever
     * ~1,400 rows Firestore felt like leaving out, and this funnel
     * needs the *visitor identity* on each row (who reached
     * `/checkout`), which a daily aggregate count can't answer. There
     * is no rollup for that here — this queries the full range
     * directly, which at today's volume is one paginated read.
     */
    async function loadAllViews() {
      const views = [];
      for await (const view of pageViewRepository.streamRange(businessId, since, new Date())) {
        views.push(view);
      }
      return views;
    }

    const [views, quotes, paySubmits, whatsapp, orders] = await Promise.all([
      loadAllViews(),
      analyticsEventRepository.listByEventSince(businessId, FUNNEL_EVENTS.deliveryQuoteServed, since),
      analyticsEventRepository.listByEventSince(businessId, FUNNEL_EVENTS.paySubmitted, since),
      analyticsEventRepository.listByEventSince(businessId, FUNNEL_EVENTS.whatsappOrderStarted, since),
      loadOrdersInWindow(businessId, days, cache),
    ]);

    // A path may carry a query string (`/checkout?box=...`), so match
    // the path itself rather than the whole recorded string.
    const visitorsOn = (predicate: (path: string) => boolean) =>
      new Set(
        views.filter((view) => predicate((view.path ?? '').split('?')[0])).map((view) => view.visitorId),
      ).size;

    // `REVENUE_STATUSES`, so the bottom of this funnel is the same
    // definition of "a real sale" the revenue card uses. A funnel that
    // counted orders some other way would disagree with the number
    // beside it on the same screen, and there is no reading of that
    // which is not confusing.
    const sinceMs = since.getTime();
    const paidInRange = orders.filter(
      ({ data }) => isRealisedRevenue(data) && toMillis(data.createdAt) >= sinceMs,
    ).length;

    return {
      stages: [
        { step: 'Visited the site', count: visitorsOn(() => true) },
        { step: 'Reached the checkout', count: visitorsOn((path) => path === '/checkout') },
        { step: 'Saw their delivery total', count: quotes.length },
        { step: 'Pressed “Pay with M-Pesa”', count: paySubmits.length },
        { step: 'Paid', count: paidInRange },
      ],
      quotedVisitors: new Set(quotes.map((event) => event.visitorId)).size,
      whatsappOrdersStarted: whatsapp.length,
      days,
    };
  }

  /** Top creators by commissions earned, joined with their identity for display — real data from the awarded-commission ledger (§ Admin: Referrals). */
  async getTopCreators(businessId: string, limitTo = 10): Promise<CreatorPerformance[]> {
    const { attributions } = await referralAttributionRepository.listByBusiness(businessId, {
      limit: COMMISSION_ATTRIBUTION_LIMIT,
    });

    const byCreator = new Map<string, { conversions: number; commissionKes: number }>();
    for (const { data } of attributions) {
      const existing = byCreator.get(data.creatorId) ?? { conversions: 0, commissionKes: 0 };
      existing.conversions += 1;
      existing.commissionKes += data.commissionKes;
      byCreator.set(data.creatorId, existing);
    }

    const withIdentity = await Promise.all(
      Array.from(byCreator.entries()).map(async ([creatorId, stats]) => {
        const user = await userRepository.findById(creatorId);
        return { creatorId, displayName: user?.displayName ?? creatorId, ...stats };
      }),
    );

    return withIdentity.sort((a, b) => b.commissionKes - a.commissionKes).slice(0, limitTo);
  }

  /**
   * Keep the `customerLifetime` rollup current before anything reads
   * it (§ analytics rollups).
   *
   * Unlike `trafficDaily`, this is rebuilt whole rather than healed
   * day by day — an order's *status* can change long after it was
   * created (a refund removes revenue a previous rebuild already
   * counted), so there is no "this slice is done, never touch it
   * again" boundary the way a finished calendar day has one. At
   * today's order volume a full rebuild is one paginated read, the
   * same cost the old per-method scan already paid; past that, the
   * honest fix is a scheduled rebuild the read no longer waits on, the
   * same escalation `CustomerService`'s own doc comment already
   * commits to for the same reason.
   *
   * Memoised per request through `cache`, because `getCac`,
   * `getCacByChannel` and `getLtv` all need this fresh and the admin
   * Analytics page calls all three in one render — without this, three
   * calls would rebuild the same rollup three times.
   */
  private async ensureCustomerLifetime(
    businessId: string,
    cache: AnalyticsRequestCache,
  ): Promise<void> {
    await cache.memo(`customer-lifetime-rebuild:${businessId}`, async () => {
      await analyticsRollupService.rebuildCustomerLifetime(businessId);
      return true;
    });
  }

  /**
   * CAC for one calendar month: manually-entered spend ÷ customers
   * whose *first-ever* order fell in that month. `spendKes`/`cacKes`
   * are null when no spend has been entered yet — never a fabricated
   * zero.
   */
  async getCac(
    businessId: string,
    month: string,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<CacResult> {
    const { start, end } = monthBounds(month);
    await this.ensureCustomerLifetime(businessId, cache);
    const [spend, newCustomers] = await Promise.all([
      marketingSpendRepository.findByMonth(businessId, month),
      customerLifetimeRepository.countAcquiredInRange(businessId, start, end),
    ]);
    const spendKes = spend?.amountKes ?? null;

    return {
      month,
      spendKes,
      newCustomers,
      cacKes: spendKes !== null && newCustomers > 0 ? Math.round(spendKes / newCustomers) : null,
    };
  }

  async setMarketingSpend(
    businessId: string,
    month: string,
    amountKes: number,
    actor: string,
    channelSpend: { metaSpendKes?: number; tiktokSpendKes?: number } = {},
  ): Promise<void> {
    await marketingSpendRepository.set(businessId, month, amountKes, actor, channelSpend);
  }

  /**
   * CAC per ad platform for one calendar month (§ close the loop:
   * ad-conversion attribution): each channel's manually-entered spend
   * ÷ customers whose *first-ever* order in the scan window both fell
   * in that month and is attributed to that channel. Same "null, never
   * fabricated zero" discipline as `getCac` — a channel with no spend
   * entered gets a null CAC, not a division by zero pretending to be free.
   */
  async getCacByChannel(
    businessId: string,
    month: string,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<ChannelCacResult[]> {
    const { start, end } = monthBounds(month);
    await this.ensureCustomerLifetime(businessId, cache);
    const [spend, acquired] = await Promise.all([
      marketingSpendRepository.findByMonth(businessId, month),
      customerLifetimeRepository.listAcquiredInRange(businessId, start, end),
    ]);

    // The documents rather than a count, because this split needs each
    // customer's *first* channel — which the rollup froze at acquisition
    // time, so a later order through another channel cannot rewrite it.
    const newCustomersByChannel = new Map<OrderChannel, number>();
    for (const customer of acquired) {
      const channel = customer.firstOrderChannel as OrderChannel;
      newCustomersByChannel.set(channel, (newCustomersByChannel.get(channel) ?? 0) + 1);
    }

    const channels: { channel: 'meta' | 'tiktok'; spendKes: number | null | undefined }[] = [
      { channel: 'meta', spendKes: spend?.metaSpendKes },
      { channel: 'tiktok', spendKes: spend?.tiktokSpendKes },
    ];

    return channels.map(({ channel, spendKes }) => {
      const newCustomers = newCustomersByChannel.get(channel) ?? 0;
      const resolvedSpendKes = spendKes ?? null;
      return {
        channel,
        month,
        spendKes: resolvedSpendKes,
        newCustomers,
        cacKes: resolvedSpendKes !== null && newCustomers > 0 ? Math.round(resolvedSpendKes / newCustomers) : null,
      };
    });
  }

  /**
   * Real delivery performance (§ Logistics: wire tracking webhook
   * consumption), computed from `shipments` the same way every other
   * metric here is — a bounded scan, not a separate pipeline.
   * `medianDeliveryHours` is only as complete as the shipments that
   * have actually reached `delivered` (via either the tracking
   * webhook or a manual override) — a shipment still `in_transit`
   * contributes to `statusBreakdown` but not to the delivery-time
   * figure, since it has no real `deliveredAt` yet.
   */
  async getDeliveryPerformance(businessId: string): Promise<DeliveryPerformance> {
    const { shipments } = await shipmentRepository.listByBusiness(businessId, { limit: SHIPMENT_ANALYTICS_LIMIT });

    const statusCounts = new Map<ShipmentStatus, number>();
    const methodCounts = new Map<string, number>();
    const deliveryHours: number[] = [];

    for (const { data } of shipments) {
      statusCounts.set(data.status, (statusCounts.get(data.status) ?? 0) + 1);
      methodCounts.set(data.method, (methodCounts.get(data.method) ?? 0) + 1);

      if (data.status === 'delivered' && data.deliveredAt) {
        const hours = (toMillis(data.deliveredAt) - toMillis(data.createdAt)) / (60 * 60 * 1000);
        if (hours >= 0) {
          deliveryHours.push(hours);
        }
      }
    }

    deliveryHours.sort((a, b) => a - b);
    const medianDeliveryHours =
      deliveryHours.length > 0 ? Math.round(deliveryHours[Math.floor(deliveryHours.length / 2)]) : null;

    return {
      totalShipments: shipments.length,
      statusBreakdown: Array.from(statusCounts.entries()).map(([status, count]) => ({
        status,
        label: SHIPMENT_STATUS_LABELS[status],
        count,
      })),
      methodBreakdown: Array.from(methodCounts.entries()).map(([method, count]) => ({ method, count })),
      deliveredCount: statusCounts.get('delivered') ?? 0,
      failedCount: statusCounts.get('failed') ?? 0,
      medianDeliveryHours,
    };
  }

  /**
   * Revenue and order count per acquisition channel (§ close the loop:
   * ad-conversion attribution) — the same revenue-counting statuses
   * and bounded scan as `getRevenueOverview`, bucketed by
   * `deriveOrderChannel` instead of by day.
   */
  async getRevenueByChannel(
    businessId: string,
    days = 30,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<RevenueByChannelResult> {
    const orders = await loadOrdersInWindow(businessId, days, cache);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const inWindow = orders.filter(
      ({ data }) => isRealisedRevenue(data) && toMillis(data.createdAt) >= cutoff,
    );

    const byChannel = new Map<OrderChannel, ChannelRevenue>();
    for (const { data } of inWindow) {
      const channel = deriveOrderChannel(data);
      const existing = byChannel.get(channel) ?? { channel, orderCount: 0, revenueKes: 0 };
      existing.orderCount += 1;
      existing.revenueKes += data.pricing.totalKes;
      byChannel.set(channel, existing);
    }

    return {
      days,
      channels: Array.from(byChannel.values()).sort((a, b) => b.revenueKes - a.revenueKes),
    };
  }

  /**
   * Per creator: real revenue from the orders their code was applied
   * to, against the real commission they were actually paid for it
   * (§ close the loop: ad-conversion attribution's sibling question —
   * is the referral program itself profitable, not just active).
   * Cross-references two bounded scans rather than reading each
   * attributed order individually — same discipline as `getCac`.
   */
  async getCreatorRoi(
    businessId: string,
    days = 30,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<CreatorRoi[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const [{ attributions }, orders] = await Promise.all([
      referralAttributionRepository.listByBusiness(businessId, { limit: COMMISSION_ATTRIBUTION_LIMIT }),
      loadOrdersInWindow(businessId, days, cache),
    ]);

    const revenueByOrderId = new Map(orders.map(({ id, data }) => [id, data.pricing.totalKes]));
    /*
     * A comped box attributed to a creator would otherwise read as an
     * order that earned nothing, halving their return on a commission
     * that was never paid out of it. Held as a set of ids rather than
     * filtered out of `revenueByOrderId`, so an attribution whose
     * order simply fell outside the bounded scan still behaves as it
     * always has (counted, revenue unknown) instead of disappearing.
     */
    const compedOrderIds = new Set(
      orders.filter(({ data }) => isComplimentaryBox(data)).map(({ id }) => id),
    );

    const byCreator = new Map<string, { orderCount: number; revenueKes: number; commissionKes: number }>();
    for (const { data } of attributions) {
      if (toMillis(data.createdAt) < cutoff || compedOrderIds.has(data.orderId)) {
        continue;
      }
      const revenueKes = revenueByOrderId.get(data.orderId) ?? 0;
      const existing = byCreator.get(data.creatorId) ?? { orderCount: 0, revenueKes: 0, commissionKes: 0 };
      existing.orderCount += 1;
      existing.revenueKes += revenueKes;
      existing.commissionKes += data.commissionKes;
      byCreator.set(data.creatorId, existing);
    }

    const withIdentity = await Promise.all(
      Array.from(byCreator.entries()).map(async ([creatorId, stats]) => {
        const user = await userRepository.findById(creatorId);
        return {
          creatorId,
          displayName: user?.displayName ?? creatorId,
          ...stats,
          roi: stats.commissionKes > 0 ? Math.round((stats.revenueKes / stats.commissionKes) * 10) / 10 : null,
        };
      }),
    );

    return withIdentity.sort((a, b) => b.revenueKes - a.revenueKes).slice(0, TOP_CREATORS_ROI_LIMIT);
  }

  /**
   * What share of real revenue came back out as refunds (§ Admin:
   * Analytics). The denominator is every order that actually took a
   * real payment — `refund_requested`/`refunded` included, since that
   * money was collected too — not just `REVENUE_STATUSES`, which
   * exists to answer a different question ("how much did we keep").
   * The numerator is real `refunds` records with `status: 'succeeded'`
   * — proof money actually moved back, same discipline `types/refund.ts`
   * already documents for `Order.status`.
   */
  async getRefundRate(
    businessId: string,
    days = 30,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<RefundRateResult> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const paidStatuses: Order['status'][] = ['confirmed', 'dispatched', 'delivered', 'refund_requested', 'refunded'];

    const [orders, { refunds }] = await Promise.all([
      loadOrdersInWindow(businessId, days, cache),
      refundRepository.listByBusiness(businessId, { status: 'succeeded', limit: REFUND_SCAN_LIMIT }),
    ]);

    // Its own name is the test: an order still awaiting payment at the
    // door has taken none, so it belongs in neither half of this ratio.
    const paidInWindow = orders.filter(
      ({ data }) =>
        paidStatuses.includes(data.status) &&
        data.payment?.dueOnDelivery !== true &&
        toMillis(data.createdAt) >= cutoff,
    );
    const refundsInWindow = refunds.filter(({ data }) => toMillis(data.createdAt) >= cutoff);

    const revenueKes = paidInWindow.reduce((sum, { data }) => sum + data.pricing.totalKes, 0);
    const refundedAmountKes = refundsInWindow.reduce((sum, { data }) => sum + data.amountKes, 0);
    const refundedOrderCount = new Set(refundsInWindow.map(({ data }) => data.orderId)).size;

    return {
      days,
      orderCount: paidInWindow.length,
      refundedOrderCount,
      revenueKes,
      refundedAmountKes,
      refundRatePct: revenueKes > 0 ? (refundedAmountKes / revenueKes) * 100 : 0,
    };
  }

  /**
   * What share of customers in the window ordered more than once —
   * the number the repeat-purchase-prompt feature (once built) would
   * be trying to move. Grouped by phone number, the same real customer
   * identity every other metric here uses (§ close the loop: no
   * `CustomerProfile` collection is ever actually written to).
   */
  async getRepeatPurchaseRate(
    businessId: string,
    days = 30,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<RepeatPurchaseResult> {
    const orders = await loadOrdersInWindow(businessId, days, cache);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // A box nobody has paid for is not yet a purchase, so it is not
    // yet a repeat one either.
    const inWindow = orders.filter(
      ({ data }) => isRealisedRevenue(data) && toMillis(data.createdAt) >= cutoff,
    );

    const ordersByPhone = new Map<string, number>();
    for (const { data } of inWindow) {
      const phone = data.customer.phoneNumber;
      ordersByPhone.set(phone, (ordersByPhone.get(phone) ?? 0) + 1);
    }

    const customerCount = ordersByPhone.size;
    const repeatCustomerCount = Array.from(ordersByPhone.values()).filter((count) => count >= 2).length;

    return {
      days,
      customerCount,
      repeatCustomerCount,
      repeatRatePct: customerCount > 0 ? (repeatCustomerCount / customerCount) * 100 : 0,
    };
  }

  /**
   * What share of real payment attempts (an STK push actually sent to
   * a customer's phone) never became a real order — the number that
   * makes friction like a mismatched M-Pesa recipient name visible as
   * lost revenue instead of an invisible drop-off. `listByStatus` with
   * every status is the one way `PaymentIntentRepository` exposes a
   * time-bounded scan today — same 500-row internal cap as its other
   * callers, filtered here to the requested window.
   */
  async getCheckoutAbandonment(businessId: string, days = 30): Promise<CheckoutAbandonmentResult> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const intents = await paymentIntentRepository.listByStatus(
      businessId,
      ['pending', 'processing', 'succeeded', 'failed', 'expired'],
      PAYMENT_INTENT_SCAN_LIMIT,
    );

    const inWindow = intents.filter(({ data }) => toMillis(data.createdAt) >= cutoff);
    const succeededIntents = inWindow.filter(({ data }) => data.status === 'succeeded').length;
    const totalIntents = inWindow.length;
    const abandonedIntents = totalIntents - succeededIntents;

    return {
      days,
      totalIntents,
      succeededIntents,
      abandonedIntents,
      abandonmentRatePct: totalIntents > 0 ? (abandonedIntents / totalIntents) * 100 : 0,
    };
  }

  /**
   * Average real revenue per customer to date (§ Admin: Analytics) —
   * deliberately not a predictive/discounted LTV model, which this
   * young a business has no real repeat-purchase history to fit one
   * from. All-time within the bounded scan, not windowed by days: a
   * customer's lifetime doesn't reset every 30 days.
   */
  async getLtv(
    businessId: string,
    cache: AnalyticsRequestCache = new NoRequestCache(),
  ): Promise<LtvResult> {
    await this.ensureCustomerLifetime(businessId, cache);
    const { customerCount, totalRevenueKes } =
      await customerLifetimeRepository.aggregateLifetime(businessId);

    return {
      customerCount,
      totalRevenueKes,
      averageRevenueKes: customerCount > 0 ? Math.round(totalRevenueKes / customerCount) : 0,
    };
  }
}

export const businessAnalyticsService = new BusinessAnalyticsService();
export { BusinessAnalyticsService };

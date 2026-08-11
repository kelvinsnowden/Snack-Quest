import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { referralAttributionRepository } from '@/repositories/referralAttributionRepository';
import { userRepository } from '@/repositories/userRepository';
import { marketingSpendRepository } from '@/repositories/marketingSpendRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { pageViewRepository } from '@/repositories/pageViewRepository';
import { refundRepository } from '@/repositories/refundRepository';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { toMillis } from '@/lib/firestoreTimestamp';
import { SHIPMENT_STATUS_LABELS } from '@/lib/delivery/transitions';
import type { Order, ShipmentStatus } from '@/types';

/**
 * Real analytics, all derived on demand from the same collections the
 * rest of the Admin Portal already reads (§ Admin: Analytics) — no
 * separate analytics pipeline or warehouse, since none exists and
 * none is justified at this business's scale yet. Bounded scans, same
 * discipline as `CustomerService`: correct for today's volume, and
 * the honest fix if that changes is a real read-model, not a bigger
 * limit here.
 *
 * CAC is the one metric with no automatic data source: this codebase
 * has no ad-spend-reporting integration (Meta Conversion API sends
 * events *to* Meta for ad optimization; it does not report spend
 * back). `getCac()` is computed from a manually-entered monthly spend
 * figure (`marketingSpendRepository`) — real, not fabricated, but
 * only as accurate as what's entered.
 */
const REVENUE_ORDER_LIMIT = 1000;
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

function deriveOrderChannel(order: Order): OrderChannel {
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
}

export interface FunnelStage {
  step: string;
  count: number;
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
  async getRevenueOverview(businessId: string, days = 30): Promise<RevenueOverview> {
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });
    const windowMs = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const previousCutoff = cutoff - windowMs;

    const inWindow = orders.filter(
      (o) => REVENUE_STATUSES.includes(o.data.status) && toMillis(o.data.createdAt) >= cutoff,
    );
    // Bounded by the same REVENUE_ORDER_LIMIT scan as `inWindow` — this
    // reuses the list already fetched rather than a second query, same
    // "correct for today's volume" tradeoff the class doc comment
    // already accepts for the current window.
    const inPreviousWindow = orders.filter(
      (o) =>
        REVENUE_STATUSES.includes(o.data.status) &&
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

    return {
      totalRevenueKes,
      orderCount: inWindow.length,
      averageOrderValueKes: inWindow.length > 0 ? Math.round(totalRevenueKes / inWindow.length) : 0,
      days: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      previousPeriod: {
        totalRevenueKes: previousTotalRevenueKes,
        orderCount: inPreviousWindow.length,
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
    const windowMs = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const previousCutoff = cutoff - windowMs;

    const views = await pageViewRepository.listSince(businessId, new Date(previousCutoff));
    const inWindow = views.filter((v) => toMillis(v.createdAt) >= cutoff);
    const inPreviousWindow = views.filter((v) => toMillis(v.createdAt) < cutoff);

    const byDay = new Map<string, { date: string; visits: number; visitorIds: Set<string> }>();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      byDay.set(date, { date, visits: 0, visitorIds: new Set() });
    }

    const pageCounts = new Map<string, number>();
    const uniqueVisitors = new Set<string>();
    for (const view of inWindow) {
      uniqueVisitors.add(view.visitorId);
      pageCounts.set(view.path, (pageCounts.get(view.path) ?? 0) + 1);

      const date = new Date(toMillis(view.createdAt)).toISOString().slice(0, 10);
      const bucket = byDay.get(date);
      if (bucket) {
        bucket.visits += 1;
        bucket.visitorIds.add(view.visitorId);
      }
    }

    const previousUniqueVisitors = new Set(inPreviousWindow.map((v) => v.visitorId));

    const topPages = Array.from(pageCounts.entries())
      .map(([path, visits]) => ({ path, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, TOP_PAGES_LIMIT);

    return {
      totalVisits: inWindow.length,
      uniqueVisitors: uniqueVisitors.size,
      days: Array.from(byDay.values())
        .map(({ date, visits, visitorIds }) => ({ date, visits, uniqueVisitors: visitorIds.size }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topPages,
      previousPeriod: {
        totalVisits: inPreviousWindow.length,
        uniqueVisitors: previousUniqueVisitors.size,
      },
    };
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
   * CAC for one calendar month: manually-entered spend ÷ customers
   * whose *first-ever* order (within the bounded scan window) fell in
   * that month. `spendKes`/`cacKes` are null when no spend has been
   * entered yet — never a fabricated zero.
   */
  async getCac(businessId: string, month: string): Promise<CacResult> {
    const spend = await marketingSpendRepository.findByMonth(businessId, month);
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });

    const firstOrderMonthByPhone = new Map<string, string>();
    for (const { data } of orders) {
      const orderMonth = new Date(toMillis(data.createdAt)).toISOString().slice(0, 7);
      const phone = data.customer.phoneNumber;
      const existing = firstOrderMonthByPhone.get(phone);
      if (!existing || orderMonth < existing) {
        firstOrderMonthByPhone.set(phone, orderMonth);
      }
    }

    const newCustomers = Array.from(firstOrderMonthByPhone.values()).filter((m) => m === month).length;
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
  async getCacByChannel(businessId: string, month: string): Promise<ChannelCacResult[]> {
    const spend = await marketingSpendRepository.findByMonth(businessId, month);
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });

    const firstOrderByPhone = new Map<string, { month: string; channel: OrderChannel }>();
    for (const { data } of orders) {
      const orderMonth = new Date(toMillis(data.createdAt)).toISOString().slice(0, 7);
      const phone = data.customer.phoneNumber;
      const existing = firstOrderByPhone.get(phone);
      if (!existing || orderMonth < existing.month) {
        firstOrderByPhone.set(phone, { month: orderMonth, channel: deriveOrderChannel(data) });
      }
    }

    const newCustomersByChannel = new Map<OrderChannel, number>();
    for (const { month: firstMonth, channel } of firstOrderByPhone.values()) {
      if (firstMonth === month) {
        newCustomersByChannel.set(channel, (newCustomersByChannel.get(channel) ?? 0) + 1);
      }
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
  async getRevenueByChannel(businessId: string, days = 30): Promise<RevenueByChannelResult> {
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const inWindow = orders.filter(
      ({ data }) => REVENUE_STATUSES.includes(data.status) && toMillis(data.createdAt) >= cutoff,
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
  async getCreatorRoi(businessId: string, days = 30): Promise<CreatorRoi[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const [{ attributions }, { orders }] = await Promise.all([
      referralAttributionRepository.listByBusiness(businessId, { limit: COMMISSION_ATTRIBUTION_LIMIT }),
      orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT }),
    ]);

    const revenueByOrderId = new Map(orders.map(({ id, data }) => [id, data.pricing.totalKes]));

    const byCreator = new Map<string, { orderCount: number; revenueKes: number; commissionKes: number }>();
    for (const { data } of attributions) {
      if (toMillis(data.createdAt) < cutoff) {
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
  async getRefundRate(businessId: string, days = 30): Promise<RefundRateResult> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const paidStatuses: Order['status'][] = ['confirmed', 'dispatched', 'delivered', 'refund_requested', 'refunded'];

    const [{ orders }, { refunds }] = await Promise.all([
      orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT }),
      refundRepository.listByBusiness(businessId, { status: 'succeeded', limit: REFUND_SCAN_LIMIT }),
    ]);

    const paidInWindow = orders.filter(
      ({ data }) => paidStatuses.includes(data.status) && toMillis(data.createdAt) >= cutoff,
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
  async getRepeatPurchaseRate(businessId: string, days = 30): Promise<RepeatPurchaseResult> {
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const inWindow = orders.filter(
      ({ data }) => REVENUE_STATUSES.includes(data.status) && toMillis(data.createdAt) >= cutoff,
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
  async getLtv(businessId: string): Promise<LtvResult> {
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });
    const revenueOrders = orders.filter(({ data }) => REVENUE_STATUSES.includes(data.status));

    const revenueByPhone = new Map<string, number>();
    for (const { data } of revenueOrders) {
      const phone = data.customer.phoneNumber;
      revenueByPhone.set(phone, (revenueByPhone.get(phone) ?? 0) + data.pricing.totalKes);
    }

    const customerCount = revenueByPhone.size;
    const totalRevenueKes = Array.from(revenueByPhone.values()).reduce((sum, kes) => sum + kes, 0);

    return {
      customerCount,
      totalRevenueKes,
      averageRevenueKes: customerCount > 0 ? Math.round(totalRevenueKes / customerCount) : 0,
    };
  }
}

export const businessAnalyticsService = new BusinessAnalyticsService();
export { BusinessAnalyticsService };

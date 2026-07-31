import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { referralAttributionRepository } from '@/repositories/referralAttributionRepository';
import { userRepository } from '@/repositories/userRepository';
import { marketingSpendRepository } from '@/repositories/marketingSpendRepository';
import { toMillis } from '@/lib/firestoreTimestamp';
import type { Order } from '@/types';

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

// Orders that represent real, kept revenue — excludes pending (not
// yet a completed sale), cancelled, and refund_requested (money that
// was or will be given back).
const REVENUE_STATUSES: Order['status'][] = ['confirmed', 'dispatched', 'delivered'];

export interface RevenueDay {
  date: string;
  revenueKes: number;
  orderCount: number;
}

export interface RevenueOverview {
  totalRevenueKes: number;
  orderCount: number;
  averageOrderValueKes: number;
  days: RevenueDay[];
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

class BusinessAnalyticsService {
  async getRevenueOverview(businessId: string, days = 30): Promise<RevenueOverview> {
    const { orders } = await orderRepository.listByBusiness(businessId, { limit: REVENUE_ORDER_LIMIT });
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const inWindow = orders.filter(
      (o) => REVENUE_STATUSES.includes(o.data.status) && toMillis(o.data.createdAt) >= cutoff,
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

    return {
      totalRevenueKes,
      orderCount: inWindow.length,
      averageOrderValueKes: inWindow.length > 0 ? Math.round(totalRevenueKes / inWindow.length) : 0,
      days: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
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

  async setMarketingSpend(businessId: string, month: string, amountKes: number, actor: string): Promise<void> {
    await marketingSpendRepository.set(businessId, month, amountKes, actor);
  }
}

export const businessAnalyticsService = new BusinessAnalyticsService();
export { BusinessAnalyticsService };

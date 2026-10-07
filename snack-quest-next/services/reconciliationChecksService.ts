import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { nairobiClock } from '@/lib/ads/playlist';
import type { MachineTransaction } from '@/types';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface ReconciliationCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** How many records the check found wrong (0 when ok). */
  count: number;
  detail: string;
  /** Where to go to fix it. */
  href: string | null;
  /** True when the check read only part of the data (it says how much). */
  partial: boolean;
}

const LIMIT = 5000;
const DAY_MS = 86_400_000;

/**
 * Checks that the system's money and stock records still agree with each
 * other (§ RECONCILIATION CHECKS). Each check reads a bounded window and
 * says so when it was cut short; none of them changes anything. A check
 * that finds nothing wrong says "ok" — it never assumes.
 */
class ReconciliationChecksService {
  async run(businessId: string, now = new Date()): Promise<ReconciliationCheck[]> {
    // Each check settles on its own. These run on the Admin dashboard
    // too, so one check throwing (a missing index, a timeout) used to
    // take the whole dashboard down with "This page could not load"
    // instead of showing that one check as failed.
    return Promise.all([
      this.settle('price_projection', 'Current prices match the price history', this.priceProjection(businessId)),
      this.settle('sales_without_snapshot', 'Sales carry the costs of their own day', this.salesWithoutSnapshot(businessId, now)),
      this.settle('wholesale_vs_transfers', 'Owner stock purchases match the stock delivered to them', this.wholesaleAgainstTransfers(businessId, now)),
      this.settle('products_without_cost', 'Every snack has a cost', this.productsWithoutCost(businessId)),
      this.settle('settlements_estimated_costs', 'Settlements used each sale’s own cost', this.settlementsWithEstimatedCosts(businessId)),
      this.settle('ad_revenue_not_computed', 'Advertising revenue worked out for last month', this.adRevenueNotComputed(businessId, now)),
      this.settle('screens_not_reporting', 'Machine screens are reporting', this.screensNotReporting(businessId, now)),
    ]);
  }

  /** A check that threw reads as failed — it could not confirm anything, so it never reads as ok. */
  private async settle(key: string, label: string, check: Promise<ReconciliationCheck>): Promise<ReconciliationCheck> {
    try {
      return await check;
    } catch (error) {
      console.error(`reconciliation check ${key} failed to run`, error);
      return {
        key,
        label,
        status: 'fail',
        count: 0,
        detail: 'This check could not run. The reason is in the server log.',
        href: null,
        partial: true,
      };
    }
  }

  /** The "current price" projection must match the one open history entry for every product and price type. */
  async priceProjection(businessId: string): Promise<ReconciliationCheck> {
    const [open, current] = await Promise.all([
      adminFirestore.collection('productPrices').where('businessId', '==', businessId).where('effectiveTo', '==', null).limit(LIMIT).get(),
      adminFirestore.collection('productPriceCurrent').where('businessId', '==', businessId).limit(LIMIT).get(),
    ]);
    const openByKey = new Map<string, { id: string; amountKes: number }[]>();
    for (const doc of open.docs) {
      const data = doc.data() as { productCatalogue: string; productId: string; priceType: string; amountKes: number };
      const key = `${data.productCatalogue}:${data.productId}:${data.priceType}`;
      openByKey.set(key, [...(openByKey.get(key) ?? []), { id: doc.id, amountKes: data.amountKes }]);
    }
    let wrong = 0;
    for (const entries of openByKey.values()) if (entries.length > 1) wrong += 1;
    for (const doc of current.docs) {
      const data = doc.data() as { productCatalogue: string; productId: string; prices: Record<string, { amountKes: number; priceId: string }> };
      for (const [type, price] of Object.entries(data.prices ?? {})) {
        const entries = openByKey.get(`${data.productCatalogue}:${data.productId}:${type}`) ?? [];
        if (entries.length !== 1 || entries[0].id !== price.priceId || entries[0].amountKes !== price.amountKes) wrong += 1;
      }
    }
    const partial = open.size >= LIMIT || current.size >= LIMIT;
    return {
      key: 'price_projection',
      label: 'Current prices match the price history',
      status: wrong > 0 ? 'fail' : 'ok',
      count: wrong,
      detail: wrong > 0 ? `${wrong} product price(s) where the current price and the history disagree. Prices are only written by the price book; this means a direct database edit.` : 'Every current price is the one open entry in its history.',
      href: '/admin/snack-items',
      partial,
    };
  }

  /** Sales from the last 30 days without frozen economics are costed at today's prices, not the price on the day. */
  async salesWithoutSnapshot(businessId: string, now: Date): Promise<ReconciliationCheck> {
    const since = Timestamp.fromMillis(now.getTime() - 30 * DAY_MS);
    const snapshot = await adminFirestore.collection('machineTransactions').where('businessId', '==', businessId).where('status', '==', 'dispensed').where('createdAt', '>=', since).orderBy('createdAt', 'desc').limit(LIMIT).get();
    const missing = snapshot.docs.filter((doc) => !(doc.data() as MachineTransaction).economics).length;
    return {
      key: 'sales_without_snapshot',
      label: 'Sales carry the costs of their own day',
      status: missing > 0 ? 'warn' : 'ok',
      count: missing,
      detail:
        missing > 0
          ? `${missing} of ${snapshot.size} dispensed sales in the last 30 days have no frozen cost. Sales from before cost snapshots existed are expected here; new ones mean the snapshot failed (see the server log "sale economics snapshot failed").`
          : `All ${snapshot.size} dispensed sales in the last 30 days carry their own costs.`,
      href: '/admin/vending/sales',
      partial: snapshot.size >= LIMIT,
    };
  }

  /** Every owner stock purchase must match the stock that moved to them, restock by restock. */
  async wholesaleAgainstTransfers(businessId: string, now: Date): Promise<ReconciliationCheck> {
    const since = now.getTime() - 90 * DAY_MS;
    const [sales, transfers] = await Promise.all([
      adminFirestore.collection('ownerWholesaleSales').where('businessId', '==', businessId).limit(LIMIT).get(),
      adminFirestore.collection('stockTransfers').where('businessId', '==', businessId).where('reason', '==', 'wholesale_to_owner').limit(LIMIT).get(),
    ]);
    const sold = new Map<string, number>();
    for (const doc of sales.docs) {
      const data = doc.data() as { restockTaskId: string; lines: { quantity: number }[]; createdAt?: Timestamp };
      if (data.createdAt && data.createdAt.toMillis() < since) continue;
      sold.set(data.restockTaskId, (sold.get(data.restockTaskId) ?? 0) + data.lines.reduce((sum, line) => sum + line.quantity, 0));
    }
    const moved = new Map<string, number>();
    for (const doc of transfers.docs) {
      const data = doc.data() as { restockTaskId?: string | null; quantity: number; createdAt?: Timestamp };
      if (!data.restockTaskId || (data.createdAt && data.createdAt.toMillis() < since)) continue;
      moved.set(data.restockTaskId, (moved.get(data.restockTaskId) ?? 0) + data.quantity);
    }
    const tasks = new Set([...sold.keys(), ...moved.keys()]);
    const mismatched = [...tasks].filter((task) => (sold.get(task) ?? 0) !== (moved.get(task) ?? 0));
    return {
      key: 'wholesale_vs_transfers',
      label: 'Owner stock purchases match the stock delivered to them',
      status: mismatched.length > 0 ? 'fail' : 'ok',
      count: mismatched.length,
      detail: mismatched.length > 0 ? `${mismatched.length} restock(s) in the last 90 days where the units sold to the owner and the units moved to them differ.` : `${tasks.size} owner restock(s) in the last 90 days; every one matches.`,
      href: '/admin/vending/restock',
      partial: sales.size >= LIMIT || transfers.size >= LIMIT,
    };
  }

  /** Snacks with no recorded cost leave their sales out of profit. */
  async productsWithoutCost(businessId: string): Promise<ReconciliationCheck> {
    const snapshot = await adminFirestore.collection('snackItems').where('businessId', '==', businessId).where('costPending', '==', true).limit(LIMIT).get();
    return {
      key: 'products_without_cost',
      label: 'Every snack has a cost',
      status: snapshot.size > 0 ? 'warn' : 'ok',
      count: snapshot.size,
      detail: snapshot.size > 0 ? `${snapshot.size} snack(s) were added without a cost. Their sales count as revenue but are left out of profit until someone with cost access sets it.` : 'Every snack has a recorded cost.',
      href: '/admin/snack-items',
      partial: snapshot.size >= LIMIT,
    };
  }

  /** Finalised settlements that costed some sales at a later price than the day's. */
  async settlementsWithEstimatedCosts(businessId: string): Promise<ReconciliationCheck> {
    const snapshot = await adminFirestore.collection('machineSettlements').where('businessId', '==', businessId).limit(LIMIT).get();
    const affected = snapshot.docs.filter((doc) => {
      const data = doc.data() as { status?: string; estimatedCostSaleCount?: number };
      return data.status !== 'draft' && (data.estimatedCostSaleCount ?? 0) > 0;
    });
    return {
      key: 'settlements_estimated_costs',
      label: 'Settlements used each sale’s own cost',
      status: affected.length > 0 ? 'warn' : 'ok',
      count: affected.length,
      detail: affected.length > 0 ? `${affected.length} settlement(s) include sales from before costs were frozen per sale; those were costed at the cost when the settlement was drafted.` : 'No settlement relied on an estimated cost.',
      href: '/admin/vending/settlements',
      partial: snapshot.size >= LIMIT,
    };
  }

  /** Last month's ads were played but their revenue hasn't been worked out. */
  async adRevenueNotComputed(businessId: string, now: Date): Promise<ReconciliationCheck> {
    const today = nairobiClock(now).date;
    const firstOfThisMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const lastMonth = new Date(firstOfThisMonth.getTime() - DAY_MS).toISOString().slice(0, 7);
    const lastDay = new Date(firstOfThisMonth.getTime() - DAY_MS).toISOString().slice(0, 10);
    const [stats, revenue] = await Promise.all([
      adminFirestore.collection('adDailyStats').where('businessId', '==', businessId).where('date', '>=', `${lastMonth}-01`).where('date', '<=', lastDay).limit(LIMIT).get(),
      adminFirestore.collection('adRevenueEntries').where('businessId', '==', businessId).where('month', '==', lastMonth).get(),
    ]);
    const played = new Set(stats.docs.filter((doc) => ((doc.data() as { completed?: number }).completed ?? 0) > 0).map((doc) => (doc.data() as { campaignId: string }).campaignId));
    const computed = new Set(revenue.docs.map((doc) => (doc.data() as { campaignId: string }).campaignId));
    const missing = [...played].filter((campaignId) => !computed.has(campaignId));
    return {
      key: 'ad_revenue_not_computed',
      label: `Advertising revenue worked out for ${lastMonth}`,
      status: missing.length > 0 ? 'warn' : 'ok',
      count: missing.length,
      detail: missing.length > 0 ? `${missing.length} campaign(s) played in ${lastMonth} with no revenue worked out, so owners’ shares and machine P&Ls leave it out.` : played.size > 0 ? `All ${played.size} campaign(s) that played in ${lastMonth} have revenue worked out.` : `No ads played in ${lastMonth}.`,
      href: `/admin/vending/advertising?month=${lastMonth}`,
      partial: stats.size >= LIMIT,
    };
  }

  /** Screens report every 5 minutes; one silent for an hour on an active machine needs a look. */
  async screensNotReporting(businessId: string, now: Date): Promise<ReconciliationCheck> {
    const [states, machines] = await Promise.all([
      adminFirestore.collection('kioskDeviceStates').where('businessId', '==', businessId).limit(LIMIT).get(),
      adminFirestore.collection('machines').where('businessId', '==', businessId).where('status', '==', 'active').limit(LIMIT).get(),
    ]);
    const active = new Set(machines.docs.map((doc) => doc.id));
    const silent = states.docs.filter((doc) => {
      const data = doc.data() as { machineId: string; reportedAt?: Timestamp };
      return active.has(data.machineId) && (!data.reportedAt || now.getTime() - data.reportedAt.toMillis() > 60 * 60 * 1000);
    });
    return {
      key: 'screens_not_reporting',
      label: 'Machine screens are reporting',
      status: silent.length > 0 ? 'warn' : 'ok',
      count: silent.length,
      detail:
        silent.length > 0
          ? `${silent.length} active machine screen(s) have been silent for over an hour. Their menu may still work offline, but plays and activity aren’t arriving.`
          : `${states.size} screen(s) have reported; none of the active ones is silent. Machines whose screen has never reported aren’t counted here.`,
      href: '/admin/vending',
      partial: states.size >= LIMIT || machines.size >= LIMIT,
    };
  }
}

export const reconciliationChecksService = new ReconciliationChecksService();

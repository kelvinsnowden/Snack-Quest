import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import { fulfillmentBatchRepository } from '@/repositories/fulfillmentBatchRepository';
import { isOrderBatchable } from '@/lib/fulfillmentBatches/eligibility';
import { toMillis } from '@/lib/firestoreTimestamp';
import type { FulfillmentBatch, Order } from '@/types';

/**
 * What the fulfilment batches actually add up to (§ Fulfillment
 * Batches — accounting). `FulfillmentBatchService` records one
 * shopping trip; this answers the question a business owner asks after
 * a month of them: what did we sell, what did it cost, and what did we
 * keep?
 *
 * The number that makes this honest is `uncosted`. A batch only exists
 * once someone records a shopping trip against a group of orders, so
 * at any moment some paid orders have revenue recognised and no cost
 * recorded against them at all. Reporting gross profit while quietly
 * excluding those orders would overstate margin — every order with no
 * cost behind it looks like pure profit. So the rollup reports costed
 * and uncosted separately, never blended, and never silently drops the
 * uncosted ones.
 *
 * Bounded scans, same discipline and same honest limitation as
 * `BusinessAnalyticsService`: correct at today's volume, and the fix
 * when that changes is a real read-model, not a bigger limit here.
 */

const ORDER_SCAN_LIMIT = 1000;
const BATCH_SCAN_LIMIT = 500;

export interface FulfillmentAccountingTotals {
  orderCount: number;
  revenueKes: number;
  costKes: number;
  grossProfitKes: number;
  /** 0 when there's no revenue, never a division-by-zero NaN. */
  marginPct: number;
}

/** One paid order carrying revenue that no shopping trip has been costed against yet. */
export interface UncostedOrder {
  id: string;
  customerName: string;
  packageLabel: string;
  revenueKes: number;
  status: Order['status'];
  createdAtIso: string;
  /** How long this order has been sitting uncosted — the thing that makes a growing number actionable rather than just large. */
  ageDays: number;
}

export interface FulfillmentAccountingOverview {
  /** The reporting window, in days. */
  days: number;
  /** Orders inside the window that a batch has recorded a real cost against. */
  costed: FulfillmentAccountingTotals;
  /**
   * Orders inside the window with revenue and no recorded cost.
   * `costKes`, `grossProfitKes` and `marginPct` are deliberately absent
   * from this shape — there is no cost to report, and reporting the
   * revenue as profit is exactly the mistake this split prevents.
   */
  uncosted: { orderCount: number; revenueKes: number };
  /** Every batch created inside the window, for the trend and the average trip cost. */
  batchCount: number;
  averageBatchCostKes: number;
  /** What share of in-window revenue has a real cost behind it. 100 means everything is accounted for. */
  costCoveragePct: number;
  /** The oldest uncosted orders first — the ones most overdue a shopping trip being recorded. */
  oldestUncosted: UncostedOrder[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyTotals(): FulfillmentAccountingTotals {
  return { orderCount: 0, revenueKes: 0, costKes: 0, grossProfitKes: 0, marginPct: 0 };
}

function finalizeTotals(totals: FulfillmentAccountingTotals): FulfillmentAccountingTotals {
  const grossProfitKes = totals.revenueKes - totals.costKes;
  return {
    ...totals,
    grossProfitKes,
    marginPct: totals.revenueKes > 0 ? (grossProfitKes / totals.revenueKes) * 100 : 0,
  };
}

class FulfillmentAccountingService {
  async getOverview(businessId: string, days = 30): Promise<FulfillmentAccountingOverview> {
    const cutoff = Date.now() - days * DAY_MS;

    const [{ orders }, { batches }] = await Promise.all([
      orderRepository.listByBusiness(businessId, { limit: ORDER_SCAN_LIMIT }),
      fulfillmentBatchRepository.listByBusiness(businessId, { limit: BATCH_SCAN_LIMIT }),
    ]);

    const inWindow = orders.filter((order) => toMillis(order.data.createdAt) >= cutoff);

    const costed = emptyTotals();
    const uncosted = { orderCount: 0, revenueKes: 0 };
    const uncostedOrders: UncostedOrder[] = [];

    for (const { id, data } of inWindow) {
      if (data.fulfillment) {
        costed.orderCount += 1;
        // The batch's own snapshot, not the order's current pricing —
        // `Order.fulfillment` froze both at allocation time and they
        // are what the batch's profit was computed from.
        costed.revenueKes += data.fulfillment.orderRevenueKes;
        costed.costKes += data.fulfillment.allocatedCostKes;
        continue;
      }

      // Only orders that *could* be batched count as uncosted. A
      // cancelled or refunded order has no shopping trip owed against
      // it, so listing it as a gap would be inventing work.
      if (!isOrderBatchable(data.status, data.fulfillmentBatchId)) {
        continue;
      }

      const createdAtMs = toMillis(data.createdAt);
      uncosted.orderCount += 1;
      uncosted.revenueKes += data.pricing.totalKes;
      uncostedOrders.push({
        id,
        customerName: data.customer.customerName,
        packageLabel: data.product.packageLabel,
        revenueKes: data.pricing.totalKes,
        status: data.status,
        createdAtIso: new Date(createdAtMs).toISOString(),
        ageDays: Math.floor((Date.now() - createdAtMs) / DAY_MS),
      });
    }

    const batchesInWindow: FulfillmentBatch[] = batches
      .map((batch) => batch.data)
      .filter((batch) => toMillis(batch.createdAt) >= cutoff);
    const totalBatchCostKes = batchesInWindow.reduce((sum, batch) => sum + batch.costs.totalCostKes, 0);

    const totalRevenueKes = costed.revenueKes + uncosted.revenueKes;

    return {
      days,
      costed: finalizeTotals(costed),
      uncosted,
      batchCount: batchesInWindow.length,
      averageBatchCostKes:
        batchesInWindow.length > 0 ? Math.round(totalBatchCostKes / batchesInWindow.length) : 0,
      costCoveragePct: totalRevenueKes > 0 ? (costed.revenueKes / totalRevenueKes) * 100 : 100,
      oldestUncosted: uncostedOrders.sort((a, b) => b.ageDays - a.ageDays).slice(0, 10),
    };
  }
}

export const fulfillmentAccountingService = new FulfillmentAccountingService();
export { FulfillmentAccountingService };

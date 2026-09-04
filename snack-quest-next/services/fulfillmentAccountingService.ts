import 'server-only';

import { orderRepository } from '@/repositories/orderRepository';
import { fulfillmentBatchRepository } from '@/repositories/fulfillmentBatchRepository';
import { isOrderBatchable } from '@/lib/fulfillmentBatches/eligibility';
import { isComplimentaryBox } from '@/lib/analytics/complimentaryOrder';
import { toMillis } from '@/lib/firestoreTimestamp';
import { orderLines } from '@/types/checkoutLine';
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

/**
 * Margin for one kind of box (§ fulfilment records the real cost).
 *
 * The rollup answers "are we making money"; this answers the question
 * that can actually be acted on — *which box* makes it. A shop selling
 * two products at very different margins reads the same average
 * whichever one it sells more of.
 *
 * Counted per line, so a two-box order contributes to both. Its cost
 * is split across the boxes it contains, in proportion to nothing more
 * clever than the count — the recorded cost is for the order as a
 * whole and nobody wrote down which packet went where.
 */
export interface PackageMargin {
  packageId: string;
  packageLabel: string;
  boxCount: number;
  revenueKes: number;
  costKes: number;
  grossProfitKes: number;
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
  /** Which box actually makes money, best margin first. Costed orders only. */
  byPackage: PackageMargin[];
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

    /*
     * Giveaways are left out entirely (§ separate PR boxes from
     * revenue and averages).
     *
     * A comped box carries a real cost against no revenue, so counting
     * it here does damage twice: in `costed` it drags the margin down
     * with stock that was never sold, and in `uncosted` it appears as
     * a bookkeeping gap even though `uncosted` is documented as
     * revenue awaiting a cost — and there is no revenue to await one.
     *
     * Not hidden: they are reported on their own, with the stock they
     * carried, by `getRevenueOverview().complimentary`. Seeding is a
     * marketing cost, and reading it as cost of goods sold makes the
     * boxes that were sold look less profitable than they are.
     */
    const inWindow = orders.filter(
      (order) => toMillis(order.data.createdAt) >= cutoff && !isComplimentaryBox(order.data),
    );

    const costed = emptyTotals();
    const uncosted = { orderCount: 0, revenueKes: 0 };
    const uncostedOrders: UncostedOrder[] = [];

    const packageTotals = new Map<string, PackageMargin>();

    function attributeToPackages(data: Order, revenueKes: number, costKes: number) {
      const lines = orderLines(data.product);
      const boxes = lines.reduce((sum, line) => sum + line.quantity, 0) || 1;
      for (const line of lines) {
        const share = line.quantity / boxes;
        const current = packageTotals.get(line.packageId) ?? {
          packageId: line.packageId,
          packageLabel: line.packageLabel,
          boxCount: 0,
          revenueKes: 0,
          costKes: 0,
          grossProfitKes: 0,
          marginPct: 0,
        };
        current.boxCount += line.quantity;
        current.revenueKes += Math.round(revenueKes * share);
        current.costKes += Math.round(costKes * share);
        packageTotals.set(line.packageId, current);
      }
    }

    for (const { id, data } of inWindow) {
      /*
       * A cost somebody actually recorded against this order beats a
       * batch's allocation of a shopping trip across many
       * (§ fulfilment records the real cost).
       *
       * The allocation is an estimate spread evenly; `costs` is the
       * real figure from the person who packed the box and held the
       * receipts. When an order has both, the real one wins — and
       * before this it was ignored entirely, so every cost the
       * warehouse entered was invisible here and its order still
       * counted as an unaccounted gap.
       */
      if (data.costs) {
        const costKes = data.costs.goodsCostKes + data.costs.otherCostKes;
        costed.orderCount += 1;
        costed.revenueKes += data.pricing.totalKes;
        costed.costKes += costKes;
        attributeToPackages(data, data.pricing.totalKes, costKes);
        continue;
      }

      if (data.fulfillment) {
        costed.orderCount += 1;
        // The batch's own snapshot, not the order's current pricing —
        // `Order.fulfillment` froze both at allocation time and they
        // are what the batch's profit was computed from.
        costed.revenueKes += data.fulfillment.orderRevenueKes;
        costed.costKes += data.fulfillment.allocatedCostKes;
        attributeToPackages(data, data.fulfillment.orderRevenueKes, data.fulfillment.allocatedCostKes);
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
      byPackage: [...packageTotals.values()]
        .map((entry) => ({
          ...entry,
          grossProfitKes: entry.revenueKes - entry.costKes,
          marginPct:
            entry.revenueKes > 0 ? ((entry.revenueKes - entry.costKes) / entry.revenueKes) * 100 : 0,
        }))
        // Worst margin first: the box quietly losing money is the one
        // worth finding, and it is never the one at the top of an
        // alphabetical list.
        .sort((a, b) => a.marginPct - b.marginPct),
      oldestUncosted: uncostedOrders.sort((a, b) => b.ageDays - a.ageDays).slice(0, 10),
    };
  }
}

export const fulfillmentAccountingService = new FulfillmentAccountingService();
export { FulfillmentAccountingService };

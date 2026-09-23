import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { partnerDailySummaryRepository } from '@/repositories/partnerDailySummaryRepository';
import { dateKey, dayBounds } from '@/lib/analytics/dateKey';
import type { MachineDailySummary, PartnerDailySummary } from '@/types';

/**
 * `machineDailySummary`/`partnerDailySummary` rollups (§ ANALYTICS,
 * docs/ANALYTICS_ROLLUPS.md §3, docs/FLEET_ARCHITECTURE_AUDIT.md §6).
 * The exact same primitive `AnalyticsRollupService` already built for
 * `trafficDaily` — compute the expensive thing once, off the request
 * path, store the answer, self-heal a missing day on read — applied to
 * the fleet's own event streams instead of `pageViews`.
 *
 * Each rebuild recomputes a whole machine-day (or partner-day) from
 * the raw collections and replaces whatever was there, the same
 * idempotent-by-construction property `rebuildTrafficDay` has: running
 * it twice for the same day costs a redundant read, never a wrong
 * number. There is deliberately no fleet-wide document any of this
 * writes to — every write here is scoped to one machine+day or one
 * partner+day, so machines transacting concurrently never contend on
 * the same document (§ ANALYTICS: "do not create one giant fleet
 * document that becomes a write hotspot").
 */

const TRANSACTION_PAGE_SIZE = 500;
const MOVEMENT_PAGE_SIZE = 500;
const TELEMETRY_PAGE_SIZE = 500;

type MachineDayRollup = Omit<MachineDailySummary, 'businessId' | 'machineId' | 'date' | 'rebuiltAt'>;
type PartnerDayRollup = Omit<PartnerDailySummary, 'businessId' | 'partnerId' | 'date' | 'rebuiltAt'>;

class VendingRollupService {
  /**
   * Compute one machine-day from `machineTransactions`,
   * `machineInventoryMovements` and `machineTelemetryEvents`, without
   * storing it — the same split `computeTrafficDay` has from
   * `rebuildTrafficDay`, so the current (still-accumulating) day can be
   * read live without ever being written as if it were finished.
   */
  async computeMachineDay(businessId: string, machineId: string, date: string): Promise<MachineDayRollup> {
    const { start, end } = dayBounds(date);

    let transactionCount = 0;
    let dispensedCount = 0;
    let paidVendFailedCount = 0;
    let grossSalesKes = 0;
    let refundsKes = 0;
    let unitsSold = 0;
    const byProduct: Record<string, { unitsSold: number; grossSalesKes: number }> = {};

    for await (const { data } of machineTransactionRepository.streamRange(businessId, {
      machineId,
      since: start,
      until: end,
      pageSize: TRANSACTION_PAGE_SIZE,
    })) {
      transactionCount += 1;
      if (data.status === 'dispensed') {
        dispensedCount += 1;
        unitsSold += 1;
        grossSalesKes += data.amountKes;
        const product = byProduct[data.productId] ?? { unitsSold: 0, grossSalesKes: 0 };
        product.unitsSold += 1;
        product.grossSalesKes += data.amountKes;
        byProduct[data.productId] = product;
      } else if (data.status === 'paid_vend_failed') {
        paidVendFailedCount += 1;
      } else if (data.status === 'refunded') {
        refundsKes += data.amountKes;
      }
    }

    const restockCount = await countAsyncIterable(
      machineInventoryMovementRepository.streamMovementsInRange(businessId, {
        reason: 'restock',
        machineId,
        since: start,
        until: end,
        pageSize: MOVEMENT_PAGE_SIZE,
      }),
    );

    const faultCount = await countAsyncIterable(
      machineTelemetryEventRepository.streamRange(businessId, {
        machineId,
        eventType: 'fault',
        since: start,
        until: end,
        pageSize: TELEMETRY_PAGE_SIZE,
      }),
    );

    const heartbeatCount = await countAsyncIterable(
      machineTelemetryEventRepository.streamRange(businessId, {
        machineId,
        eventType: 'heartbeat',
        since: start,
        until: end,
        pageSize: TELEMETRY_PAGE_SIZE,
      }),
    );

    return {
      transactionCount,
      dispensedCount,
      paidVendFailedCount,
      grossSalesKes,
      refundsKes,
      unitsSold,
      averageOrderValueKes: dispensedCount > 0 ? Math.round((grossSalesKes / dispensedCount) * 100) / 100 : null,
      byProduct,
      restockCount,
      faultCount,
      heartbeatCount,
    };
  }

  /** Compute one completed machine-day and store it. */
  async rebuildMachineDay(businessId: string, machineId: string, date: string): Promise<MachineDayRollup> {
    const rollup = await this.computeMachineDay(businessId, machineId, date);
    await machineDailySummaryRepository.put(businessId, machineId, date, rollup);
    return rollup;
  }

  /** Rebuild every completed day in `[startDate, endDate]` for one machine — today is skipped, same reasoning as `rebuildTrafficRange`. */
  async rebuildMachineDayRange(businessId: string, machineId: string, startDate: string, endDate: string): Promise<{ days: number }> {
    const today = dateKey(new Date());
    let days = 0;
    for (const date of datesBetween(startDate, endDate)) {
      if (date >= today) {
        continue;
      }
      await this.rebuildMachineDay(businessId, machineId, date);
      days += 1;
    }
    return { days };
  }

  /**
   * A partner's whole portfolio for one day, composed from each owned
   * machine's own `machineDailySummary` rather than re-streaming raw
   * transactions per partner (§ RBAC "27 machines, one read" — this is
   * the one read a partner dashboard actually issues once this is
   * stored). A machine with no stored rollup yet for this day is
   * computed on the spot and not persisted, the same self-healing
   * `computeTrafficDay` does for a single day — this method itself
   * never writes a machine's own rollup, only reads or computes one.
   */
  async computePartnerDay(businessId: string, partnerId: string, date: string): Promise<PartnerDayRollup> {
    const owned = await machineRepository.listByPartner(businessId, partnerId);
    const machineIds = owned.map((m) => m.id);
    const stored = await machineDailySummaryRepository.listForDate(businessId, machineIds, date);

    let transactionCount = 0;
    let dispensedCount = 0;
    let grossSalesKes = 0;
    let refundsKes = 0;
    let faultCount = 0;

    for (const machineId of machineIds) {
      const rollup = stored.get(machineId) ?? (await this.computeMachineDay(businessId, machineId, date));
      transactionCount += rollup.transactionCount;
      dispensedCount += rollup.dispensedCount;
      grossSalesKes += rollup.grossSalesKes;
      refundsKes += rollup.refundsKes;
      faultCount += rollup.faultCount;
    }

    return { machineCount: machineIds.length, transactionCount, dispensedCount, grossSalesKes, refundsKes, faultCount };
  }

  async rebuildPartnerDay(businessId: string, partnerId: string, date: string): Promise<PartnerDayRollup> {
    const rollup = await this.computePartnerDay(businessId, partnerId, date);
    await partnerDailySummaryRepository.put(businessId, partnerId, date, rollup);
    return rollup;
  }

  async rebuildPartnerDayRange(businessId: string, partnerId: string, startDate: string, endDate: string): Promise<{ days: number }> {
    const today = dateKey(new Date());
    let days = 0;
    for (const date of datesBetween(startDate, endDate)) {
      if (date >= today) {
        continue;
      }
      await this.rebuildPartnerDay(businessId, partnerId, date);
      days += 1;
    }
    return { days };
  }
}

/** Counts an async generator's yields without materialising them — used for the fault/heartbeat/restock counts, where only the count is wanted. */
async function countAsyncIterable(iterable: AsyncIterable<unknown>): Promise<number> {
  let count = 0;
  const iterator = iterable[Symbol.asyncIterator]();
  for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
    count += 1;
  }
  return count;
}

/** Inclusive `YYYY-MM-DD` walk, UTC — same helper `analyticsRollupService` uses. */
function* datesBetween(startDate: string, endDate: string): Generator<string> {
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    yield dateKey(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export const vendingRollupService = new VendingRollupService();
export { VendingRollupService };

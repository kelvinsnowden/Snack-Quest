import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { dateKey } from '@/lib/analytics/dateKey';
import { trailingWindow, classifyDataQuality, type DataQuality } from '@/services/machineAssortmentIntelligenceService';
import type { Machine } from '@/types';

const MAX_MACHINES_PER_BUSINESS = 10000;

export interface ProductPerformance {
  productId: string;
  category: string | null;
  unitsSold: number;
  revenueKes: number;
  cogsKes: number;
  grossProfitKes: number;
  /** `grossProfitKes / revenueKes`, null when there was no revenue to divide by rather than a fabricated zero margin. */
  marginPct: number | null;
  /** `unitsSold / daysWithData` — days with a stored rollup for at least one carrying machine, not calendar days in the window. */
  velocityPerDay: number;
  /** Distinct `locationId`s where this product is currently `assorted && visible` — never a count of machines, per § LOCATION IS THE INTELLIGENCE UNIT. */
  locationsStocked: number;
  /** Distinct `locationId`s where this product actually sold at least one unit in the window. */
  locationsSelling: number;
  /** The share of (machine × day) observations in the window where this product appeared in that day's `stockoutProductIds` — a frequency, not a duration. */
  stockoutFrequencyPct: number;
  daysWithData: number;
  dataQuality: DataQuality;
}

export interface TimeIntelligence {
  /** `unitsSold` by UTC hour-of-day (0-23), summed over the window — bounded, cached-by-caller read, never an unbounded scan (§ TIME INTELLIGENCE). */
  byHour: number[];
  /** `unitsSold` by day-of-week, `0` = Sunday through `6` = Saturday. */
  byWeekday: number[];
  windowDays: number;
  dataQuality: DataQuality;
}

/**
 * Per-SKU performance across the whole network, or a given subset of
 * machines (§ PRODUCT INTELLIGENCE). Built entirely from
 * `machineDailySummary`'s already-rolled-up `byProduct` — the same
 * "compose from the smaller rollup" discipline `networkDailySummary`
 * uses, applied per product instead of per category. Iterates every
 * carrying machine's own rollup range rather than a dedicated
 * `productDailySummary` collection — a real, deliberate scope
 * decision named in `docs/SNACK_INTELLIGENCE.md`, not an oversight:
 * a dedicated per-product rollup is real future work once machine
 * count makes per-machine iteration itself the bottleneck.
 */
class ProductIntelligenceService {
  async getNetworkProductPerformance(businessId: string, windowDays = 30): Promise<ProductPerformance[]> {
    const { machines } = await machineRepository.listByBusiness(businessId, { limit: MAX_MACHINES_PER_BUSINESS });
    return this.getProductPerformanceForMachines(businessId, machines, windowDays);
  }

  async getLocationProductPerformance(businessId: string, locationId: string, windowDays = 30): Promise<ProductPerformance[]> {
    const machines = await machineRepository.listByLocation(businessId, locationId);
    return this.getProductPerformanceForMachines(businessId, machines, windowDays);
  }

  private async getProductPerformanceForMachines(
    businessId: string,
    machines: { id: string; data: Machine }[],
    windowDays: number,
  ): Promise<ProductPerformance[]> {
    const { startDate, endDate } = trailingWindow(windowDays);
    const machineLocationId = new Map(machines.map((m) => [m.id, m.data.locationId]));

    const totals = new Map<
      string,
      { unitsSold: number; revenueKes: number; cogsKes: number; grossProfitKes: number; category: string | null; locationsStocked: Set<string>; locationsSelling: Set<string>; stockoutObservations: number }
    >();
    let daysObserved = 0;

    for (const machine of machines) {
      const rollups = await machineDailySummaryRepository.listRange(businessId, machine.id, startDate, endDate);
      daysObserved = Math.max(daysObserved, rollups.size);
      const locationId = machineLocationId.get(machine.id) ?? null;

      for (const rollup of rollups.values()) {
        for (const [productId, product] of Object.entries(rollup.byProduct)) {
          const entry = totals.get(productId) ?? {
            unitsSold: 0,
            revenueKes: 0,
            cogsKes: 0,
            grossProfitKes: 0,
            category: null,
            locationsStocked: new Set<string>(),
            locationsSelling: new Set<string>(),
            stockoutObservations: 0,
          };
          entry.unitsSold += product.unitsSold;
          entry.revenueKes += product.grossSalesKes;
          entry.cogsKes += product.cogsKes;
          entry.grossProfitKes += product.grossProfitKes;
          entry.category = product.category ?? entry.category;
          if (locationId && product.unitsSold > 0) {
            entry.locationsSelling.add(locationId);
          }
          totals.set(productId, entry);
        }
        for (const productId of rollup.stockoutProductIds) {
          const entry = totals.get(productId) ?? {
            unitsSold: 0,
            revenueKes: 0,
            cogsKes: 0,
            grossProfitKes: 0,
            category: null,
            locationsStocked: new Set<string>(),
            locationsSelling: new Set<string>(),
            stockoutObservations: 0,
          };
          entry.stockoutObservations += 1;
          totals.set(productId, entry);
        }
      }

      // "currently stocked" is a live-state question, not a rollup one — read from this machine's own current assortment, once per machine.
      const assortmentRows = await machineAssortmentRepository.listByMachine(businessId, machine.id);
      for (const row of assortmentRows) {
        if (!row.assorted || !row.visible || !locationId) {
          continue;
        }
        const entry = totals.get(row.productId) ?? {
          unitsSold: 0,
          revenueKes: 0,
          cogsKes: 0,
          grossProfitKes: 0,
          category: row.category,
          locationsStocked: new Set<string>(),
          locationsSelling: new Set<string>(),
          stockoutObservations: 0,
        };
        entry.locationsStocked.add(locationId);
        entry.category = entry.category ?? row.category;
        totals.set(row.productId, entry);
      }
    }

    const dataQuality = classifyDataQuality(daysObserved, windowDays);
    return Array.from(totals.entries()).map(([productId, t]) => ({
      productId,
      category: t.category,
      unitsSold: t.unitsSold,
      revenueKes: t.revenueKes,
      cogsKes: t.cogsKes,
      grossProfitKes: t.grossProfitKes,
      marginPct: t.revenueKes > 0 ? Math.round((t.grossProfitKes / t.revenueKes) * 10000) / 100 : null,
      velocityPerDay: daysObserved > 0 ? Math.round((t.unitsSold / daysObserved) * 100) / 100 : 0,
      locationsStocked: t.locationsStocked.size,
      locationsSelling: t.locationsSelling.size,
      stockoutFrequencyPct: daysObserved > 0 ? Math.round((t.stockoutObservations / daysObserved) * 10000) / 100 : 0,
      daysWithData: daysObserved,
      dataQuality,
    }));
  }

  /**
   * Hour-of-day / weekday sales distribution (§ TIME INTELLIGENCE) —
   * deliberately a **bounded, direct window query** over
   * `machineTransactions` (never a full scan), the same "in the last N
   * days is a windowed question, query the range directly" rule
   * `docs/ANALYTICS_ROLLUPS.md` states for exactly this reason. No
   * hourly rollup exists to read instead — building one before this
   * shows up as an actual bottleneck would be premature.
   */
  async getTimeIntelligence(businessId: string, machineId: string, windowDays = 30): Promise<TimeIntelligence> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const until = new Date();
    const byHour = new Array(24).fill(0) as number[];
    const byWeekday = new Array(7).fill(0) as number[];
    const daysWithSales = new Set<string>();

    for await (const { data } of machineTransactionRepository.streamRange(businessId, { machineId, since, until })) {
      if (data.status !== 'dispensed') {
        continue;
      }
      const at = data.createdAt.toDate();
      byHour[at.getUTCHours()] += 1;
      byWeekday[at.getUTCDay()] += 1;
      daysWithSales.add(dateKey(at));
    }

    return {
      byHour,
      byWeekday,
      windowDays,
      dataQuality: classifyDataQuality(daysWithSales.size, windowDays),
    };
  }
}

export const productIntelligenceService = new ProductIntelligenceService();
export { ProductIntelligenceService };

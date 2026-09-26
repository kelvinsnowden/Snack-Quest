import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { locationService, LocationNotFoundError } from '@/services/locationService';
import { machineAssortmentIntelligenceService } from '@/services/machineAssortmentIntelligenceService';
import { productIntelligenceService, type ProductPerformance } from '@/services/productIntelligenceService';
import { trailingWindow, classifyDataQuality, type DataQuality } from '@/services/machineAssortmentIntelligenceService';

export { LocationNotFoundError };

export interface LocationDna {
  locationId: string;
  windowDays: number;
  machineCount: number;
  revenueKes: number;
  unitsSold: number;
  transactionCount: number;
  /** `revenueKes / dispensedCount`, null when nothing dispensed rather than a division by zero. */
  averageOrderValueKes: number | null;
  revenuePerDayKes: number;
  unitsPerDay: number;
  grossProfitKes: number;
  marginPct: number | null;
  categoryMix: Record<string, { unitsSold: number; revenueKes: number }>;
  /** The share of (machine × day) observations where at least one assorted product was stocked out — a frequency signal, not a duration. */
  stockoutRatePct: number;
  /** Assorted to at least one of this location's machines, zero units sold across the whole window. */
  deadStockProductIds: string[];
  /** UTC hour-of-day (0-23) sale counts, summed across every machine at this location. */
  peakHours: number[];
  /** Day-of-week (0=Sunday..6=Saturday) sale counts, summed across every machine at this location. */
  peakDays: number[];
  topProducts: ProductPerformance[];
  slowProducts: ProductPerformance[];
  /** Total assorted-product count summed across every machine here — a location with 3 machines of 20 SKUs each has assortmentDepth 60, not 20. */
  assortmentDepth: number;
  dataQuality: DataQuality;
}

/**
 * Location DNA (§ LOCATION DNA) — every figure calculated from real
 * rollup/assortment/slot data for this location's own machines, never
 * a hard-coded conclusion like the brief's own "university → Asian
 * snacks, peak 12-14" example, which is illustrative, not a rule this
 * code encodes.
 */
class LocationIntelligenceService {
  async getLocationDna(businessId: string, locationId: string, windowDays = 30): Promise<LocationDna> {
    const location = await locationService.findById(businessId, locationId);
    if (!location) {
      throw new LocationNotFoundError(locationId);
    }

    const machines = await machineRepository.listByLocation(businessId, locationId);
    const { startDate, endDate } = trailingWindow(windowDays);

    let transactionCount = 0;
    let dispensedCount = 0;
    let revenueKes = 0;
    let unitsSold = 0;
    let grossProfitKes = 0;
    let stockoutObservations = 0;
    let daysObserved = 0;
    const categoryMix: Record<string, { unitsSold: number; revenueKes: number }> = {};
    const peakHours = new Array(24).fill(0) as number[];
    const peakDays = new Array(7).fill(0) as number[];
    let assortmentDepth = 0;

    for (const { id: machineId } of machines) {
      const rollups = await machineDailySummaryRepository.listRange(businessId, machineId, startDate, endDate);
      daysObserved = Math.max(daysObserved, rollups.size);

      for (const rollup of rollups.values()) {
        transactionCount += rollup.transactionCount;
        dispensedCount += rollup.dispensedCount;
        revenueKes += rollup.grossSalesKes;
        unitsSold += rollup.unitsSold;
        stockoutObservations += rollup.stockoutProductIds.length;
        for (const product of Object.values(rollup.byProduct)) {
          grossProfitKes += product.grossProfitKes;
          const key = product.category ?? 'uncategorized';
          const bucket = categoryMix[key] ?? { unitsSold: 0, revenueKes: 0 };
          bucket.unitsSold += product.unitsSold;
          bucket.revenueKes += product.grossSalesKes;
          categoryMix[key] = bucket;
        }
      }

      const time = await productIntelligenceService.getTimeIntelligence(businessId, machineId, windowDays);
      for (let h = 0; h < 24; h += 1) peakHours[h] += time.byHour[h];
      for (let d = 0; d < 7; d += 1) peakDays[d] += time.byWeekday[d];

      const layers = await machineAssortmentIntelligenceService.classifyMachineCatalogLayers(businessId, machineId);
      assortmentDepth += layers.assortmentCount;
    }

    const productPerformance = await productIntelligenceService.getLocationProductPerformance(businessId, locationId, windowDays);
    const sortedByRevenue = [...productPerformance].sort((a, b) => b.revenueKes - a.revenueKes);
    const deadStockProductIds = productPerformance.filter((p) => p.unitsSold === 0 && p.locationsStocked > 0).map((p) => p.productId);

    // A machine's slot state (for stockout-rate denominator honesty) — the
    // rate below is per (machine × day), so a location with no machines
    // or no data days reports 0, never a divide-by-zero.
    const denominator = machines.length * Math.max(daysObserved, 1);

    return {
      locationId,
      windowDays,
      machineCount: machines.length,
      revenueKes,
      unitsSold,
      transactionCount,
      averageOrderValueKes: dispensedCount > 0 ? Math.round((revenueKes / dispensedCount) * 100) / 100 : null,
      revenuePerDayKes: daysObserved > 0 ? Math.round((revenueKes / daysObserved) * 100) / 100 : 0,
      unitsPerDay: daysObserved > 0 ? Math.round((unitsSold / daysObserved) * 100) / 100 : 0,
      grossProfitKes,
      marginPct: revenueKes > 0 ? Math.round((grossProfitKes / revenueKes) * 10000) / 100 : null,
      categoryMix,
      stockoutRatePct: denominator > 0 ? Math.round((stockoutObservations / denominator) * 10000) / 100 : 0,
      deadStockProductIds,
      peakHours,
      peakDays,
      topProducts: sortedByRevenue.slice(0, 5),
      slowProducts: sortedByRevenue.filter((p) => p.unitsSold > 0).slice(-5).reverse(),
      assortmentDepth,
      dataQuality: classifyDataQuality(daysObserved, windowDays),
    };
  }

  /** Every currently-enabled slot's `priceKes` for this location's machines, grouped by category — a real, observed price distribution, never a suggested price. */
  async getPriceBehavior(businessId: string, locationId: string): Promise<Record<string, { minKes: number; maxKes: number; avgKes: number; count: number }>> {
    const machines = await machineRepository.listByLocation(businessId, locationId);
    const byCategory: Record<string, number[]> = {};

    for (const { id: machineId } of machines) {
      const [slots, assortmentRows] = await Promise.all([
        machineSlotRepository.listByMachine(businessId, machineId),
        machineAssortmentRepository.listByMachine(businessId, machineId),
      ]);
      const categoryBySlotCode = new Map(assortmentRows.filter((row) => row.slotCode).map((row) => [row.slotCode as string, row.category]));

      for (const slot of slots) {
        if (!slot.enabled) {
          continue;
        }
        const key = categoryBySlotCode.get(slot.slotCode) ?? 'uncategorized';
        byCategory[key] = [...(byCategory[key] ?? []), slot.priceKes];
      }
    }

    const result: Record<string, { minKes: number; maxKes: number; avgKes: number; count: number }> = {};
    for (const [category, prices] of Object.entries(byCategory)) {
      result[category] = {
        minKes: Math.min(...prices),
        maxKes: Math.max(...prices),
        avgKes: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
        count: prices.length,
      };
    }
    return result;
  }
}

export const locationIntelligenceService = new LocationIntelligenceService();
export { LocationIntelligenceService };

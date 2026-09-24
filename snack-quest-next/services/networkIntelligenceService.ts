import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { networkDailySummaryRepository } from '@/repositories/networkDailySummaryRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { locationService } from '@/services/locationService';
import { locationIntelligenceService, type LocationDna } from '@/services/locationIntelligenceService';
import { trailingWindow, classifyDataQuality, type DataQuality } from '@/services/machineAssortmentIntelligenceService';
import { dateKey } from '@/lib/analytics/dateKey';
import type { Location } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CategoryTotal {
  category: string;
  unitsSold: number;
  revenueKes: number;
}

export interface CategoryGrowth {
  category: string;
  firstHalfRevenueKes: number;
  secondHalfRevenueKes: number;
  /** `null` when the first half had zero revenue — a growth percentage against zero is not a real number, never fabricated as one. */
  growthPct: number | null;
}

export interface LocationTypePerformance {
  locationType: Location['locationType'];
  locationCount: number;
  revenueKes: number;
  unitsSold: number;
  revenuePerLocationKes: number;
}

export interface NetworkOverview {
  windowDays: number;
  machineCount: number;
  locationCount: number;
  transactionCount: number;
  revenueKes: number;
  unitsSold: number;
  averageOrderValueKes: number | null;
  grossProfitKes: number;
  marginPct: number | null;
  /** Units currently sitting in every enabled slot across the fleet — a live read, not a rollup (§ NETWORK INTELLIGENCE: "inventory deployed"). */
  inventoryUnitsDeployed: number;
  /** The subset of `inventoryUnitsDeployed` this codebase can actually cost (snackItem-catalogue slots) — never a fabricated value for package-catalogue slots, which carry no cost field. */
  inventoryValueKes: number;
  stockoutSnapshotCount: number;
  topCategories: CategoryTotal[];
  fastestGrowingCategories: CategoryGrowth[];
  dataQuality: DataQuality;
}

/**
 * The whole-fleet view (§ NETWORK INTELLIGENCE) — composed from
 * `networkDailySummary` rollups, never a live scan of raw
 * transactions across the fleet. `inventoryUnitsDeployed`/`inventoryValueKes`
 * are the one live read here, because "what's sitting in machines
 * right now" is a current-state question a rollup cannot answer —
 * the same distinction `docs/ANALYTICS_ROLLUPS.md`'s own "windowed vs
 * aggregate" rule draws.
 */
class NetworkIntelligenceService {
  async getNetworkOverview(businessId: string, windowDays = 30): Promise<NetworkOverview> {
    const { startDate, endDate } = trailingWindow(windowDays);
    const [rollups, machines, locations] = await Promise.all([
      networkDailySummaryRepository.listRange(businessId, startDate, endDate),
      machineRepository.listAllStatuses(businessId),
      locationService.listByBusiness(businessId),
    ]);

    let transactionCount = 0;
    let dispensedCount = 0;
    let revenueKes = 0;
    let unitsSold = 0;
    let grossProfitKes = 0;
    let stockoutSnapshotCount = 0;
    const categoryTotals = new Map<string, CategoryTotal>();
    const midpoint = dateKey(new Date(Date.now() - Math.floor(windowDays / 2) * DAY_MS));
    const firstHalfByCategory = new Map<string, number>();
    const secondHalfByCategory = new Map<string, number>();

    for (const [date, rollup] of rollups) {
      transactionCount += rollup.transactionCount;
      dispensedCount += rollup.dispensedCount;
      revenueKes += rollup.grossSalesKes;
      unitsSold += rollup.unitsSold;
      grossProfitKes += rollup.grossProfitKes;
      stockoutSnapshotCount += rollup.stockoutSnapshotCount;

      for (const [category, totals] of Object.entries(rollup.byCategory)) {
        const existing = categoryTotals.get(category) ?? { category, unitsSold: 0, revenueKes: 0 };
        existing.unitsSold += totals.unitsSold;
        existing.revenueKes += totals.grossSalesKes;
        categoryTotals.set(category, existing);

        const half = date < midpoint ? firstHalfByCategory : secondHalfByCategory;
        half.set(category, (half.get(category) ?? 0) + totals.grossSalesKes);
      }
    }

    const allCategories = new Set([...firstHalfByCategory.keys(), ...secondHalfByCategory.keys()]);
    const fastestGrowingCategories: CategoryGrowth[] = Array.from(allCategories)
      .map((category) => {
        const firstHalfRevenueKes = firstHalfByCategory.get(category) ?? 0;
        const secondHalfRevenueKes = secondHalfByCategory.get(category) ?? 0;
        return {
          category,
          firstHalfRevenueKes,
          secondHalfRevenueKes,
          growthPct: firstHalfRevenueKes > 0 ? Math.round(((secondHalfRevenueKes - firstHalfRevenueKes) / firstHalfRevenueKes) * 10000) / 100 : null,
        };
      })
      .sort((a, b) => (b.growthPct ?? -Infinity) - (a.growthPct ?? -Infinity));

    const { unitsDeployed, valueKes } = await this.getInventoryDeployed(businessId);

    return {
      windowDays,
      machineCount: machines.length,
      locationCount: locations.length,
      transactionCount,
      revenueKes,
      unitsSold,
      averageOrderValueKes: dispensedCount > 0 ? Math.round((revenueKes / dispensedCount) * 100) / 100 : null,
      grossProfitKes,
      marginPct: revenueKes > 0 ? Math.round((grossProfitKes / revenueKes) * 10000) / 100 : null,
      inventoryUnitsDeployed: unitsDeployed,
      inventoryValueKes: valueKes,
      stockoutSnapshotCount,
      topCategories: Array.from(categoryTotals.values()).sort((a, b) => b.revenueKes - a.revenueKes).slice(0, 5),
      fastestGrowingCategories: fastestGrowingCategories.slice(0, 5),
      dataQuality: classifyDataQuality(rollups.size, windowDays),
    };
  }

  private async getInventoryDeployed(businessId: string): Promise<{ unitsDeployed: number; valueKes: number }> {
    const { machines } = await machineRepository.listByBusiness(businessId, { limit: 10000 });
    const snackItemIds = new Set<string>();
    const slotsByMachine = new Map<string, Awaited<ReturnType<typeof machineSlotRepository.listByMachine>>>();

    for (const { id: machineId } of machines) {
      const slots = await machineSlotRepository.listByMachine(businessId, machineId);
      slotsByMachine.set(machineId, slots);
      for (const slot of slots) {
        if (slot.productCatalogue === 'snackItem' && slot.productId) {
          snackItemIds.add(slot.productId);
        }
      }
    }
    const snackItemsById = await snackItemRepository.findManyById(Array.from(snackItemIds));

    let unitsDeployed = 0;
    let valueKes = 0;
    for (const slots of slotsByMachine.values()) {
      for (const slot of slots) {
        unitsDeployed += slot.currentQuantity;
        if (slot.productCatalogue === 'snackItem' && slot.productId) {
          const item = snackItemsById.get(slot.productId);
          if (item) {
            valueKes += slot.currentQuantity * item.expectedUnitCostKes;
          }
        }
      }
    }
    return { unitsDeployed, valueKes };
  }

  /**
   * Location-type performance (§ NETWORK INTELLIGENCE: "location-type
   * performance") — every location's own `LocationDna`, grouped by
   * `locationType`. Real per-location Location DNA underneath, not a
   * shortcut re-aggregation; this is the one place in this service
   * that costs `O(locations × machines)` reads, named here rather
   * than hidden — see docs/SNACK_INTELLIGENCE.md for the scaling note.
   */
  async getLocationTypePerformance(businessId: string, windowDays = 30): Promise<LocationTypePerformance[]> {
    const locations = await locationService.listByBusiness(businessId);
    const byType = new Map<Location['locationType'], { revenueKes: number; unitsSold: number; locationCount: number }>();

    for (const { id, data } of locations) {
      const dna = await locationIntelligenceService.getLocationDna(businessId, id, windowDays);
      const bucket = byType.get(data.locationType) ?? { revenueKes: 0, unitsSold: 0, locationCount: 0 };
      bucket.revenueKes += dna.revenueKes;
      bucket.unitsSold += dna.unitsSold;
      bucket.locationCount += 1;
      byType.set(data.locationType, bucket);
    }

    return Array.from(byType.entries()).map(([locationType, bucket]) => ({
      locationType,
      ...bucket,
      revenuePerLocationKes: bucket.locationCount > 0 ? Math.round((bucket.revenueKes / bucket.locationCount) * 100) / 100 : 0,
    }));
  }

  /**
   * Side-by-side factual metrics for the given locations (§ LOCATION
   * BENCHMARKING) — deliberately returns each location's own
   * `LocationDna` unranked; the brief itself warns against a
   * simplistic overall "winner," so this never computes one.
   */
  async compareLocations(businessId: string, locationIds: string[], windowDays = 30): Promise<LocationDna[]> {
    return Promise.all(locationIds.map((locationId) => locationIntelligenceService.getLocationDna(businessId, locationId, windowDays)));
  }
}

export const networkIntelligenceService = new NetworkIntelligenceService();
export { NetworkIntelligenceService };

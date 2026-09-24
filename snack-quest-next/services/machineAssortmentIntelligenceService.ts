import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { dateKey } from '@/lib/analytics/dateKey';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `[startDate, endDate]`, both `YYYY-MM-DD`, ending yesterday — the last `windowDays` *completed* days, never today (today's rollup is never stored). */
function trailingWindow(windowDays: number): { startDate: string; endDate: string } {
  const endDate = dateKey(new Date(Date.now() - DAY_MS));
  const startDate = dateKey(new Date(Date.now() - windowDays * DAY_MS));
  return { startDate, endDate };
}

export type DataQuality = 'actual' | 'estimated' | 'insufficient_data';

/**
 * `docs/SNACK_INTELLIGENCE.md`'s own minimum: fewer than this many
 * rolled-up days in a window means "not enough real data," never a
 * confident-looking number computed from almost nothing.
 */
const MIN_DAYS_FOR_ACTUAL = 7;

function classifyDataQuality(daysWithData: number, windowDays: number): DataQuality {
  if (daysWithData === 0) {
    return 'insufficient_data';
  }
  if (daysWithData < MIN_DAYS_FOR_ACTUAL || daysWithData < windowDays * 0.5) {
    return 'estimated';
  }
  return 'actual';
}

export interface MachineCatalogLayers {
  /** Every active product (snackItem + package) this business's global catalogue holds — what exists, not what any one machine carries. */
  globalCatalogCount: number;
  /** Assorted to this machine, regardless of visibility or current stock (§ MACHINE-SPECIFIC ASSORTMENT INTELLIGENCE). */
  assortmentCount: number;
  /** Assorted and currently reporting a sellable-positive quantity on its linked slot. */
  stockedCount: number;
  /** `machineAssortmentService.getSellableCatalog`'s own `sellable: true` count — assorted, visible, stocked, and the machine itself active. */
  sellableCount: number;
}

export interface SlotPerformance {
  slotCode: string;
  productId: string;
  category: string | null;
  unitsSold: number;
  revenueKes: number;
  grossProfitKes: number;
  /** The live current quantity on this slot, `0` when the slot cannot be found at all. */
  currentQuantity: number;
  /** The live capacity of this slot, `0` when the slot cannot be found at all — never used as a divisor without checking first. */
  capacity: number;
  /** Currently reports zero sellable quantity, from the live slot read, not a rollup snapshot. */
  currentlyStockedOut: boolean;
  /** No units sold in the window at all, while still assorted — a real dead-slot signal, not "new and untested." */
  dead: boolean;
  /**
   * `unitsSold / activeDays` — never `unitsSold / windowDays`
   * (§ STOCKOUT INTELLIGENCE: "a machine that was offline for two days
   * should not be treated as having two days of normal demand").
   * `activeDays` (see `MachineAssortmentPerformance.activeDays`) is
   * how many days in the window this machine actually showed a real
   * sign of life — a heartbeat or an actual processed transaction,
   * both already-recorded facts on `MachineDailySummary`, not a new
   * signal invented for this. Zero when `activeDays` is zero, never a
   * division by zero pretending to be a rate.
   */
  velocityPerDay: number;
  /** Top quartile of this machine's own slots by `revenueKes` — relative to its own assortment, never a network-wide threshold. */
  highVelocity: boolean;
  /** Bottom quartile of this machine's own slots by `revenueKes`, excluding dead slots (which are already flagged separately). */
  underperforming: boolean;
}

export interface MachineAssortmentPerformance {
  windowDays: number;
  /** How many days in the window this machine showed a real sign of life (a heartbeat or an actual processed transaction) — the downtime-aware denominator every velocity figure here uses, never `windowDays` itself. */
  activeDays: number;
  dataQuality: DataQuality;
  slots: SlotPerformance[];
}

/**
 * "The system must know the difference between GLOBAL PRODUCT,
 * MACHINE ASSORTMENT, CURRENT STOCK, SELLABLE PRODUCT" and per-slot
 * assortment performance (§ MACHINE-SPECIFIC ASSORTMENT INTELLIGENCE,
 * § ASSORTMENT PERFORMANCE, docs/SNACK_INTELLIGENCE.md). Every number
 * here is read from data that already exists — `machineAssortmentService`'s
 * own layered model and `machineDailySummary`'s rollups — never a new
 * source of truth competing with either.
 */
class MachineAssortmentIntelligenceService {
  async classifyMachineCatalogLayers(businessId: string, machineId: string): Promise<MachineCatalogLayers> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }

    const [activeSnackItems, activePackages, assortmentRows, slots, sellableCatalog] = await Promise.all([
      snackItemRepository.listByBusiness(businessId, { activeOnly: true }),
      packageRepository.listActive(businessId),
      machineAssortmentRepository.listByMachine(businessId, machineId),
      machineSlotRepository.listByMachine(businessId, machineId),
      machineAssortmentService.getSellableCatalog(businessId, machineId),
    ]);

    const assorted = assortmentRows.filter((row) => row.assorted);
    const slotByCode = new Map(slots.map((slot) => [slot.slotCode, slot]));
    const stockedCount = assorted.filter((row) => {
      const slot = row.slotCode ? slotByCode.get(row.slotCode) : null;
      return Boolean(slot) && slot!.currentQuantity > 0;
    }).length;

    return {
      globalCatalogCount: activeSnackItems.length + activePackages.length,
      assortmentCount: assorted.length,
      stockedCount,
      sellableCount: sellableCatalog.filter((item) => item.sellable).length,
    };
  }

  /**
   * Per-slot performance over a trailing window (§ ASSORTMENT
   * PERFORMANCE) — summed from this machine's own already-rolled-up
   * `machineDailySummary` days, never a live scan of raw transactions.
   * High-velocity/underperforming are quartile thresholds computed
   * against this one machine's own slots, not a network-wide bar —
   * a machine with three slots and a machine with thirty are each
   * judged against themselves.
   */
  async getAssortmentPerformance(businessId: string, machineId: string, windowDays = 30): Promise<MachineAssortmentPerformance> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }

    const { startDate, endDate } = trailingWindow(windowDays);
    const [rollups, assortmentRows, slots] = await Promise.all([
      machineDailySummaryRepository.listRange(businessId, machineId, startDate, endDate),
      machineAssortmentRepository.listByMachine(businessId, machineId),
      machineSlotRepository.listByMachine(businessId, machineId),
    ]);
    const slotByCode = new Map(slots.map((slot) => [slot.slotCode, slot]));

    let activeDays = 0;
    const totalsByProduct = new Map<string, { unitsSold: number; revenueKes: number; grossProfitKes: number; category: string | null }>();
    for (const rollup of rollups.values()) {
      // "Active" means some real signal the machine was actually reachable that day — a heartbeat, or (just as real) an actual transaction it processed. Neither is invented; both are already-recorded facts on the rollup.
      if (rollup.heartbeatCount > 0 || rollup.transactionCount > 0) {
        activeDays += 1;
      }
      for (const [productId, product] of Object.entries(rollup.byProduct)) {
        const totals = totalsByProduct.get(productId) ?? { unitsSold: 0, revenueKes: 0, grossProfitKes: 0, category: null };
        totals.unitsSold += product.unitsSold;
        totals.revenueKes += product.grossSalesKes;
        totals.grossProfitKes += product.grossProfitKes;
        totals.category = product.category ?? totals.category;
        totalsByProduct.set(productId, totals);
      }
    }

    const bySlot = assortmentRows
      .filter((row) => row.assorted && row.slotCode)
      .map((row) => {
        const slot = slotByCode.get(row.slotCode!);
        const totals = totalsByProduct.get(row.productId) ?? { unitsSold: 0, revenueKes: 0, grossProfitKes: 0, category: row.category };
        return {
          slotCode: row.slotCode!,
          productId: row.productId,
          category: row.category ?? totals.category,
          unitsSold: totals.unitsSold,
          revenueKes: totals.revenueKes,
          grossProfitKes: totals.grossProfitKes,
          currentQuantity: slot?.currentQuantity ?? 0,
          capacity: slot?.capacity ?? 0,
          currentlyStockedOut: !slot || slot.currentQuantity <= 0,
          dead: totals.unitsSold === 0,
          velocityPerDay: activeDays > 0 ? Math.round((totals.unitsSold / activeDays) * 100) / 100 : 0,
        };
      });

    const revenues = bySlot.map((s) => s.revenueKes).sort((a, b) => a - b);
    const quartile = (p: number) => revenues[Math.min(revenues.length - 1, Math.floor(revenues.length * p))] ?? 0;
    const highThreshold = quartile(0.75);
    const lowThreshold = quartile(0.25);

    const slotsPerformance: SlotPerformance[] = bySlot.map((s) => ({
      ...s,
      highVelocity: !s.dead && bySlot.length > 1 && s.revenueKes >= highThreshold && s.revenueKes > lowThreshold,
      underperforming: !s.dead && bySlot.length > 1 && s.revenueKes <= lowThreshold && s.revenueKes < highThreshold,
    }));

    return {
      windowDays,
      activeDays,
      dataQuality: classifyDataQuality(rollups.size, windowDays),
      slots: slotsPerformance,
    };
  }
}

export const machineAssortmentIntelligenceService = new MachineAssortmentIntelligenceService();
export { MachineAssortmentIntelligenceService, classifyDataQuality, trailingWindow };

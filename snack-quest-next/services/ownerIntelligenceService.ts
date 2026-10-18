import 'server-only';

import { cache } from 'react';
import { machineService } from '@/services/machineService';
import { ownerSince, clipStartDate } from '@/lib/vending/ownerTenure';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { trailingWindow, classifyDataQuality, type DataQuality } from '@/services/machineAssortmentIntelligenceService';
import type { IntelligenceRecommendation, Machine, RecommendationType } from '@/types';

export { PartnerDoesNotOwnMachineError } from '@/services/machineService';

/** Never `PRODUCT_OPPORTUNITY` — that reasoning can cite network-wide category/peer data (§ SUPPLIER STRATEGY), which is exactly the confidential network-wide intelligence §19 says an owner must never see. */
const OWNER_VISIBLE_RECOMMENDATION_TYPES: RecommendationType[] = ['RESTOCK', 'ASSORTMENT_CHANGE', 'REMOVE_PRODUCT', 'MOVE_PRODUCT', 'PRICE_REVIEW'];

export interface OwnerMachineSummary {
  machineId: string;
  windowDays: number;
  revenueKes: number;
  unitsSold: number;
  /** For the owner's own AOV (`revenueKes / transactionCount`) — never assumed to equal `unitsSold`, since one transaction is one vend, not necessarily one unit in every future catalogue shape. */
  transactionCount: number;
  topCategory: string | null;
  topProductId: string | null;
  /** From `machineAssortmentService.getStockHealth` (the same counts `classifyMachineCatalogLayers` gives) — never the global catalogue count, which would tell an owner things about the network's own product range. */
  stockHealth: { assortmentCount: number; stockedCount: number; sellableCount: number };
  heartbeatCount: number;
  faultCount: number;
  recommendations: IntelligenceRecommendation[];
  dataQuality: DataQuality;
}

/**
 * The machine owner's own view (§ OWNER INTELLIGENCE) — deliberately
 * the narrow slice of everything this codebase can compute: this one
 * machine's own revenue/units/category/product/stock/uptime and the
 * subset of recommendations that concern it. Every read here starts
 * with `machineService.assertPartnerOwnsMachine`, the same
 * enforcement primitive every other partner-facing read in this
 * codebase already uses — an owner cannot reach another owner's
 * machine by passing a different `machineId`, and this service never
 * calls a network-wide aggregate (`networkIntelligenceService`,
 * `peerLearningService`) on an owner's behalf at all, not just
 * "filters the result" — the confidential network-wide/supplier data
 * (§19: "Do NOT expose confidential network-wide supplier intelligence
 * to machine owners") is never computed for this path in the first
 * place.
 */
/**
 * The business's pending recommendations, read once per page render
 * however many machines ask for them (React `cache`, per request only;
 * outside a render it simply reads).
 */
const pendingRecommendations = cache((businessId: string) => recommendationEngineService.listByBusiness(businessId, { status: 'pending', limit: 200 }).then((rows) => rows.map((row) => row.data)));

class OwnerIntelligenceService {
  async getMachineOwnerSummary(businessId: string, partnerId: string, machineId: string, windowDays = 30): Promise<OwnerMachineSummary> {
    const machine = await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    const [summary] = await this.summarizeOwnedMachine(businessId, { id: machineId, data: machine }, [windowDays]);
    return summary;
  }

  /**
   * The same summary for several windows at once, for a machine the caller
   * has already established this owner owns (it came from
   * `partnerService.listMachines` or `assertPartnerOwnsMachine`). One
   * rollup read covers every window (they all end yesterday), and stock
   * health and recommendations are read once, not once per window.
   */
  async summarizeOwnedMachine(businessId: string, machine: { id: string; data: Machine }, windows: number[]): Promise<OwnerMachineSummary[]> {
    const machineId = machine.id;
    const since = ownerSince(machine.data);
    const ranges = windows.map((windowDays) => {
      const { startDate, endDate } = trailingWindow(windowDays);
      // Only this owner's whole days with the machine — never a previous owner's sales.
      return { windowDays, startDate: clipStartDate(startDate, since), endDate };
    });
    const earliest = ranges.reduce((min, range) => (range.startDate < min ? range.startDate : min), ranges[0].startDate);
    const [allRollups, stockHealth, allRecommendations] = await Promise.all([
      machineDailySummaryRepository.listRange(businessId, machineId, earliest, ranges[0].endDate),
      machineAssortmentService.getStockHealth(businessId, { id: machineId, status: machine.data.status }),
      pendingRecommendations(businessId),
    ]);
    const recommendations = allRecommendations.filter(
      (r) => r.target.kind === 'machine' && r.target.id === machineId && OWNER_VISIBLE_RECOMMENDATION_TYPES.includes(r.type),
    );

    return ranges.map(({ windowDays, startDate, endDate }) => {
      let revenueKes = 0;
      let unitsSold = 0;
      let transactionCount = 0;
      let heartbeatCount = 0;
      let faultCount = 0;
      let daysWithData = 0;
      const categoryTotals = new Map<string, number>();
      const productTotals = new Map<string, number>();

      for (const [date, rollup] of allRollups) {
        if (date < startDate || date > endDate) continue;
        daysWithData += 1;
        revenueKes += rollup.grossSalesKes;
        unitsSold += rollup.unitsSold;
        transactionCount += rollup.transactionCount;
        heartbeatCount += rollup.heartbeatCount;
        faultCount += rollup.faultCount;
        for (const [productId, product] of Object.entries(rollup.byProduct)) {
          productTotals.set(productId, (productTotals.get(productId) ?? 0) + product.grossSalesKes);
          if (product.category) {
            categoryTotals.set(product.category, (categoryTotals.get(product.category) ?? 0) + product.grossSalesKes);
          }
        }
      }

      const topCategory = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const topProductId = Array.from(productTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      return {
        machineId,
        windowDays,
        revenueKes,
        unitsSold,
        transactionCount,
        topCategory,
        topProductId,
        stockHealth,
        heartbeatCount,
        faultCount,
        recommendations,
        dataQuality: classifyDataQuality(daysWithData, windowDays),
      };
    });
  }
}

export const ownerIntelligenceService = new OwnerIntelligenceService();
export { OwnerIntelligenceService };

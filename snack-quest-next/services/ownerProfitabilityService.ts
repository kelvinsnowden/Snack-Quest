import 'server-only';

import { partnerService } from '@/services/partnerService';
import { machinePnlService, type PnlSale } from '@/services/machinePnlService';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { businessHourAndWeekday } from '@/lib/vending/businessClock';
import { productEconomics, type ProductEconomics } from '@/lib/finance/economics';
import { nairobiDateKey, previousPeriod, type ReportingPeriod } from '@/lib/finance/periods';
import { isCustomerSale } from '@/types';

export interface OwnerProfitabilityFilters {
  machineId?: string | null;
  locationId?: string | null;
  productId?: string | null;
  category?: string | null;
}

export interface OwnerSaleRow {
  id: string;
  transactionRef: string;
  machineId: string;
  machineCode: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPriceKes: number;
  /** What the owner paid for the unit. Snack Quest's own cost is never included here. */
  yourCostKes: number | null;
  grossProfitKes: number | null;
  grossMarginPct: number | null;
  costEstimated: boolean;
  dispensedAt: string | null;
}

export interface OwnerProfitability {
  period: { preset: string; from: string; to: string; days: number };
  totals: ProductEconomics & { averageTransactionKes: number | null; subscriptionKes: number; contributionKes: number };
  previous: { netRevenueKes: number; grossProfitKes: number; units: number };
  refundedToCustomers: { count: number; amountKes: number };
  byDay: { date: string; revenueKes: number; grossProfitKes: number; units: number }[];
  byHour: { hour: number; revenueKes: number; units: number }[];
  byMachine: { machineId: string; machineCode: string; locationId: string | null; revenueKes: number; grossProfitKes: number; grossMarginPct: number | null; units: number }[];
  byProduct: { productId: string; productName: string; category: string | null; units: number; revenueKes: number; grossProfitKes: number; grossMarginPct: number | null }[];
  sales: OwnerSaleRow[];
  /** Costs that were estimated (sales before cost snapshots) or unknown — the reader is told, never misled. */
  notes: { estimatedCostUnits: number; unpricedUnits: number; missingCosts: string[] };
  filterOptions: { machines: { id: string; code: string }[]; locations: string[]; categories: string[] };
}

/**
 * An owner's profitability across their machines (§ OWNER PROFITABILITY
 * DASHBOARD, § OWNER MARGIN VISIBILITY), from the owner's perspective of the
 * machine P&L: their selling price, what they paid for each unit, their
 * gross profit and margin. Snack Quest's landed cost is never part of this —
 * an owner sees "your cost", which is whatever their agreement says they pay.
 */
class OwnerProfitabilityService {
  async report(businessId: string, partnerId: string, period: ReportingPeriod, filters: OwnerProfitabilityFilters = {}, saleLimit = 200): Promise<OwnerProfitability> {
    const machines = await partnerService.listMachines(businessId, partnerId);
    const selected = machines.filter(({ id, data }) => (!filters.machineId || id === filters.machineId) && (!filters.locationId || data.locationId === filters.locationId));
    const since = (ownerSince: Date | null, start: Date) => (ownerSince && ownerSince > start ? ownerSince : start);

    const previous = previousPeriod(period);
    const [pnls, previousPnls, assortments] = await Promise.all([
      Promise.all(selected.map(({ id, data }) => machinePnlService.forMachine({ businessId, machineId: id, periodStart: since(data.ownerSince?.toDate() ?? null, period.start), periodEnd: period.end, perspective: 'owner' }))),
      Promise.all(selected.map(({ id, data }) => machinePnlService.forMachine({ businessId, machineId: id, periodStart: since(data.ownerSince?.toDate() ?? null, previous.start), periodEnd: previous.end, perspective: 'owner' }))),
      Promise.all(selected.map(({ id }) => machineAssortmentRepository.listByMachine(businessId, id))),
    ]);
    const categoryOf = new Map<string, string | null>();
    assortments.flat().forEach((row) => categoryOf.set(`${row.machineId}__${row.productId}`, row.category));

    const keep = (machineId: string, sale: PnlSale) => (!filters.productId || sale.productId === filters.productId) && (!filters.category || categoryOf.get(`${machineId}__${sale.productId}`) === filters.category);
    const salesByMachine = pnls.map((pnl) => ({ pnl, sales: pnl.sales.filter((sale) => keep(pnl.machineId, sale)) }));
    const allSales = salesByMachine.flatMap(({ pnl, sales }) => sales.map((sale) => ({ machineId: pnl.machineId, sale })));
    const previousSales = previousPnls.flatMap((pnl) => pnl.sales.filter((sale) => keep(pnl.machineId, sale)));

    const economicsOf = (sales: PnlSale[]) => productEconomics(sales.map((sale) => ({ units: 1, grossKes: sale.retailPriceKes, unitCostKes: sale.unitCostKes })));
    const totals = economicsOf(allSales.map(({ sale }) => sale));
    const previousTotals = economicsOf(previousSales);
    const subscriptionKes = pnls.reduce((sum, pnl) => sum + (-(pnl.contribution.lines.find((line) => line.key === 'subscription')?.amountKes ?? 0) || 0), 0);

    const names = await this.productNames(businessId, [...new Set(allSales.map(({ sale }) => `${sale.productCatalogue}__${sale.productId}`))]);
    const codeOf = new Map(machines.map(({ id, data }) => [id, data.machineCode]));

    const byDayMap = new Map<string, { revenueKes: number; grossProfitKes: number; units: number }>();
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, revenueKes: 0, units: 0 }));
    const byProductMap = new Map<string, { productId: string; productName: string; category: string | null; sales: PnlSale[] }>();
    for (const { machineId, sale } of allSales) {
      if (sale.dispensedAt) {
        const day = nairobiDateKey(sale.dispensedAt);
        const entry = byDayMap.get(day) ?? { revenueKes: 0, grossProfitKes: 0, units: 0 };
        entry.revenueKes += sale.retailPriceKes;
        entry.grossProfitKes += sale.grossProfitKes ?? 0;
        entry.units += 1;
        byDayMap.set(day, entry);
        const { hour } = businessHourAndWeekday(sale.dispensedAt);
        byHour[hour].revenueKes += sale.retailPriceKes;
        byHour[hour].units += 1;
      }
      const product = byProductMap.get(sale.productId) ?? { productId: sale.productId, productName: names.get(`${sale.productCatalogue}__${sale.productId}`) ?? sale.productId, category: categoryOf.get(`${machineId}__${sale.productId}`) ?? null, sales: [] };
      product.sales.push(sale);
      byProductMap.set(sale.productId, product);
    }

    const byDay: OwnerProfitability['byDay'] = [];
    for (let at = period.start.getTime(); at < period.end.getTime(); at += 86_400_000) {
      const date = nairobiDateKey(new Date(at));
      byDay.push({ date, ...(byDayMap.get(date) ?? { revenueKes: 0, grossProfitKes: 0, units: 0 }) });
    }

    const refunded = await this.refundedInPeriod(businessId, selected.map(({ id }) => id), period);

    return {
      period: { preset: period.preset, from: period.fromKey, to: period.toKey, days: period.days },
      totals: {
        ...totals,
        averageTransactionKes: totals.units > 0 ? Math.round(totals.netRevenueKes / totals.units) : null,
        subscriptionKes,
        contributionKes: totals.grossProfitKes - subscriptionKes,
      },
      previous: { netRevenueKes: previousTotals.netRevenueKes, grossProfitKes: previousTotals.grossProfitKes, units: previousTotals.units },
      refundedToCustomers: refunded,
      byDay,
      byHour,
      byMachine: salesByMachine.map(({ pnl, sales }) => {
        const economics = economicsOf(sales);
        return { machineId: pnl.machineId, machineCode: codeOf.get(pnl.machineId) ?? pnl.machineId, locationId: pnl.profile.locationId, revenueKes: economics.netRevenueKes, grossProfitKes: economics.grossProfitKes, grossMarginPct: economics.grossMarginPct, units: economics.units };
      }),
      byProduct: [...byProductMap.values()]
        .map(({ productId, productName, category, sales }) => {
          const economics = economicsOf(sales);
          return { productId, productName, category, units: economics.units, revenueKes: economics.netRevenueKes, grossProfitKes: economics.grossProfitKes, grossMarginPct: economics.grossMarginPct };
        })
        .sort((a, b) => b.revenueKes - a.revenueKes),
      sales: allSales
        .sort((a, b) => (b.sale.dispensedAt?.getTime() ?? 0) - (a.sale.dispensedAt?.getTime() ?? 0))
        .slice(0, saleLimit)
        .map(({ machineId, sale }) => ({
          id: sale.id,
          transactionRef: sale.transactionRef,
          machineId,
          machineCode: codeOf.get(machineId) ?? machineId,
          productId: sale.productId,
          productName: names.get(`${sale.productCatalogue}__${sale.productId}`) ?? sale.productId,
          quantity: 1,
          sellingPriceKes: sale.retailPriceKes,
          yourCostKes: sale.unitCostKes,
          grossProfitKes: sale.grossProfitKes,
          grossMarginPct: sale.grossMarginPct,
          costEstimated: sale.costEstimated,
          dispensedAt: sale.dispensedAt ? sale.dispensedAt.toISOString() : null,
        })),
      notes: {
        estimatedCostUnits: allSales.filter(({ sale }) => sale.costEstimated).length,
        unpricedUnits: totals.unpricedUnits,
        missingCosts: [...new Set(pnls.flatMap((pnl) => pnl.contribution.missing))],
      },
      filterOptions: {
        machines: machines.map(({ id, data }) => ({ id, code: data.machineCode })),
        locations: [...new Set(machines.map(({ data }) => data.locationId).filter((id): id is string => Boolean(id)))],
        categories: [...new Set(assortments.flat().map((row) => row.category).filter((category): category is string => Boolean(category)))].sort(),
      },
    };
  }

  /** Customer money returned in the period for sales that never counted as revenue (the product didn't come out). */
  private async refundedInPeriod(businessId: string, machineIds: string[], period: ReportingPeriod): Promise<{ count: number; amountKes: number }> {
    let count = 0;
    let amountKes = 0;
    for (const machineId of machineIds) {
      for await (const { data } of machineTransactionRepository.streamRange(businessId, { machineId, since: period.start, until: period.end })) {
        if (data.status === 'refunded' && isCustomerSale(data)) {
          count += 1;
          amountKes += data.amountKes;
        }
      }
    }
    return { count, amountKes };
  }

  private async productNames(businessId: string, keys: string[]): Promise<Map<string, string>> {
    const snackIds = keys.filter((key) => key.startsWith('snackItem__')).map((key) => key.slice('snackItem__'.length));
    const packageIds = keys.filter((key) => key.startsWith('package__')).map((key) => key.slice('package__'.length));
    const [snacks, packages] = await Promise.all([snackItemRepository.findManyById(snackIds), Promise.all(packageIds.map((id) => packageRepository.findById(businessId, id)))]);
    const names = new Map<string, string>();
    snacks.forEach((snack, id) => names.set(`snackItem__${id}`, snack.name));
    packageIds.forEach((id, index) => {
      const pkg = packages[index];
      if (pkg) names.set(`package__${id}`, pkg.name);
    });
    return names;
  }
}

export const ownerProfitabilityService = new OwnerProfitabilityService();

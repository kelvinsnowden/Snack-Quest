import 'server-only';

import { partnerService } from '@/services/partnerService';
import { machinePnlService, pnlSaleOf } from '@/services/machinePnlService';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { machineSalesDayService, ownerSums, type MachineSalesRange } from '@/services/machineSalesDayService';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { NO_SALES, addSums, summedEconomics, type ProductEconomics, type SummedSales } from '@/lib/finance/economics';
import { nairobiDateKey, previousPeriod, shiftKey, startOfKey, type ReportingPeriod } from '@/lib/finance/periods';
import { isCustomerSale, type Machine, type MachineTransaction, type SnackItem } from '@/types';

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

/** Figures for one group of sales — a day, a machine, a product. */
interface Bucket {
  sums: SummedSales;
  units: number;
  estimatedUnits: number;
}

const emptyBucket = (): Bucket => ({ sums: NO_SALES, units: 0, estimatedUnits: 0 });
const addTo = (bucket: Bucket, sums: SummedSales, estimatedUnits: number): void => {
  bucket.sums = addSums(bucket.sums, sums);
  bucket.units += sums.costed.units + sums.unpriced.units;
  bucket.estimatedUnits += estimatedUnits;
};
const profitOf = (sums: SummedSales) => sums.costed.grossKes - sums.costed.costKes;

/**
 * An owner's profitability across their machines (§ OWNER PROFITABILITY
 * DASHBOARD, § OWNER MARGIN VISIBILITY), from the owner's perspective of the
 * machine P&L: their selling price, what they paid for each unit, their
 * gross profit and margin. Snack Quest's landed cost is never part of this —
 * an owner sees "your cost", which is whatever their agreement says they pay.
 *
 * Built from each machine's sales summed by day (`machineSalesDayService`),
 * so a month costs a few reads per machine however busy the machines are;
 * only the newest sales, for the list at the bottom, are read one by one.
 * The figures are the per-sale P&L's to the shilling — the same costs, the
 * same "costed at today's price" estimate for sales from before costs were
 * recorded per sale.
 */
class OwnerProfitabilityService {
  async report(businessId: string, partnerId: string, period: ReportingPeriod, filters: OwnerProfitabilityFilters = {}, saleLimit = 200, now = new Date()): Promise<OwnerProfitability> {
    const machines = await partnerService.listMachines(businessId, partnerId);
    const selected = machines.filter(({ id, data }) => (!filters.machineId || id === filters.machineId) && (!filters.locationId || data.locationId === filters.locationId));
    const since = (ownerSince: Date | null, start: Date) => (ownerSince && ownerSince > start ? ownerSince : start);
    const sinceFor = (data: Machine, start: Date) => since(data.ownerSince?.toDate() ?? null, start);

    const previous = previousPeriod(period);
    const [current, before, assortments, refunded, costReads] = await Promise.all([
      Promise.all(selected.map(({ id, data }) => machineSalesDayService.read(businessId, id, sinceFor(data, period.start), period.end, now))),
      Promise.all(selected.map(({ id, data }) => machineSalesDayService.read(businessId, id, sinceFor(data, previous.start), previous.end, now))),
      Promise.all(selected.map(({ id }) => machineAssortmentRepository.listByMachine(businessId, id))),
      this.refundedInPeriod(businessId, selected.map(({ id }) => id), period),
      // Read alongside the sales: the costs below gross profit don't depend on them.
      Promise.all(
        selected.map(async ({ id, data }) => {
          const profile = await machineEconomicProfileService.resolveFor(businessId, id, data);
          return { profile, costs: await machinePnlService.costsBelowGrossProfit({ businessId, machineId: id, periodStart: sinceFor(data, period.start), periodEnd: period.end, perspective: 'owner' }, profile) };
        }),
      ),
    ]);
    const categoryOf = new Map<string, string | null>();
    assortments.flat().forEach((row) => categoryOf.set(`${row.machineId}__${row.productId}`, row.category));
    const keep = (machineId: string, productId: string) => (!filters.productId || productId === filters.productId) && (!filters.category || categoryOf.get(`${machineId}__${productId}`) === filters.category);

    // One read of the snacks and packages sold: their names, and today's cost for sales from before costs were frozen.
    const productKeys = new Set<string>();
    for (const range of [...current, ...before]) for (const day of range.days.values()) for (const key of Object.keys(day)) productKeys.add(key);
    // The list of latest sales needs only the days' totals, so it is read alongside.
    const [{ names, snacks }, latest] = await Promise.all([this.products(businessId, [...productKeys]), this.latestSales(businessId, selected.map(({ id }) => id), current, keep, saleLimit)]);
    const codeOf = new Map(machines.map(({ id, data }) => [id, data.machineCode]));

    const totals = emptyBucket();
    const byDayMap = new Map<string, { revenueKes: number; grossProfitKes: number; units: number }>();
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, revenueKes: 0, units: 0 }));
    const byProductMap = new Map<string, { productId: string; productName: string; category: string | null } & Bucket>();
    const pnls = current.map((range, index) => {
      const { id: machineId, data } = selected[index];
      const machine = emptyBucket();
      const unfiltered = emptyBucket();
      for (const [date, day] of range.days) {
        for (const [key, product] of Object.entries(day)) {
          const { sums, estimatedUnits } = ownerSums(product, snacks);
          addTo(unfiltered, sums, estimatedUnits);
          if (!keep(machineId, product.productId)) continue;
          addTo(machine, sums, estimatedUnits);
          addTo(totals, sums, estimatedUnits);
          const entry = byDayMap.get(date) ?? { revenueKes: 0, grossProfitKes: 0, units: 0 };
          entry.revenueKes += product.grossKes;
          entry.grossProfitKes += profitOf(sums);
          entry.units += product.units;
          byDayMap.set(date, entry);
          for (const [hour, [units, grossKes]] of Object.entries(product.byHour)) {
            byHour[Number(hour)].revenueKes += grossKes;
            byHour[Number(hour)].units += units;
          }
          const forProduct = byProductMap.get(product.productId) ?? { productId: product.productId, productName: names.get(key) ?? product.productId, category: categoryOf.get(`${machineId}__${product.productId}`) ?? null, ...emptyBucket() };
          addTo(forProduct, sums, estimatedUnits);
          byProductMap.set(product.productId, forProduct);
        }
      }
      const { profile, costs } = costReads[index];
      const pnl = machinePnlService.summedOwnerPnl({ businessId, machineId, periodStart: sinceFor(data, period.start), periodEnd: period.end }, profile, summedEconomics(unfiltered.sums), costs, unfiltered.estimatedUnits);
      return { pnl, machine };
    });

    const previousTotals = emptyBucket();
    before.forEach((range, index) => {
      for (const day of range.days.values()) {
        for (const product of Object.values(day)) {
          if (keep(selected[index].id, product.productId)) addTo(previousTotals, ownerSums(product, snacks).sums, 0);
        }
      }
    });

    const totalEconomics = summedEconomics(totals.sums);
    const previousEconomics = summedEconomics(previousTotals.sums);
    const subscriptionKes = pnls.reduce((sum, { pnl }) => sum + (-(pnl.contribution.lines.find((line) => line.key === 'subscription')?.amountKes ?? 0) || 0), 0);

    const byDay: OwnerProfitability['byDay'] = [];
    for (let at = period.start.getTime(); at < period.end.getTime(); at += 86_400_000) {
      const date = nairobiDateKey(new Date(at));
      byDay.push({ date, ...(byDayMap.get(date) ?? { revenueKes: 0, grossProfitKes: 0, units: 0 }) });
    }

    return {
      period: { preset: period.preset, from: period.fromKey, to: period.toKey, days: period.days },
      totals: {
        ...totalEconomics,
        averageTransactionKes: totalEconomics.units > 0 ? Math.round(totalEconomics.netRevenueKes / totalEconomics.units) : null,
        subscriptionKes,
        contributionKes: totalEconomics.grossProfitKes - subscriptionKes,
      },
      previous: { netRevenueKes: previousEconomics.netRevenueKes, grossProfitKes: previousEconomics.grossProfitKes, units: previousEconomics.units },
      refundedToCustomers: refunded,
      byDay,
      byHour,
      byMachine: pnls.map(({ pnl, machine }) => {
        const economics = summedEconomics(machine.sums);
        return { machineId: pnl.machineId, machineCode: codeOf.get(pnl.machineId) ?? pnl.machineId, locationId: pnl.profile.locationId, revenueKes: economics.netRevenueKes, grossProfitKes: economics.grossProfitKes, grossMarginPct: economics.grossMarginPct, units: economics.units };
      }),
      byProduct: [...byProductMap.values()]
        .map(({ productId, productName, category, sums }) => {
          const economics = summedEconomics(sums);
          return { productId, productName, category, units: economics.units, revenueKes: economics.netRevenueKes, grossProfitKes: economics.grossProfitKes, grossMarginPct: economics.grossMarginPct };
        })
        .sort((a, b) => b.revenueKes - a.revenueKes),
      sales: latest.map(({ machineId, id, data }) => {
        const sale = pnlSaleOf(id, data, 'owner', snacks);
        return {
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
        };
      }),
      notes: {
        estimatedCostUnits: totals.estimatedUnits,
        unpricedUnits: totalEconomics.unpricedUnits,
        missingCosts: [...new Set(pnls.flatMap(({ pnl }) => pnl.contribution.missing))],
      },
      filterOptions: {
        machines: machines.map(({ id, data }) => ({ id, code: data.machineCode })),
        locations: [...new Set(machines.map(({ data }) => data.locationId).filter((id): id is string => Boolean(id)))],
        categories: [...new Set(assortments.flat().map((row) => row.category).filter((category): category is string => Boolean(category)))].sort(),
      },
    };
  }

  /**
   * The newest `limit` sales the filters keep, across the machines. The days'
   * totals say how far back those go, so only those days are read — the sales
   * already read for the totals are reused, and stored days are read only as
   * far back as the list needs.
   */
  private async latestSales(
    businessId: string,
    machineIds: string[],
    ranges: MachineSalesRange[],
    keep: (machineId: string, productId: string) => boolean,
    limit: number,
  ): Promise<{ machineId: string; id: string; data: MachineTransaction }[]> {
    const dates = [...new Set(ranges.flatMap((range) => [...range.days.keys()]))].sort().reverse();
    const toRead = new Map<string, string[]>(); // machineId → stored dates the list reaches
    let counted = 0;
    for (const date of dates) {
      if (counted >= limit) break;
      ranges.forEach((range, index) => {
        const day = range.days.get(date);
        if (!day) return;
        const units = Object.values(day).reduce((sum, product) => sum + (keep(machineIds[index], product.productId) ? product.units : 0), 0);
        counted += units;
        if (units > 0 && range.storedDays.has(date)) toRead.set(machineIds[index], [...(toRead.get(machineIds[index]) ?? []), date]);
      });
    }

    const read = ranges.flatMap((range, index) => range.readSales.map((sale) => ({ machineId: machineIds[index], ...sale })));
    const more = await Promise.all(
      [...toRead].map(async ([machineId, stored]) => {
        const from = startOfKey(stored[stored.length - 1]);
        const to = startOfKey(shiftKey(stored[0], 1));
        const alreadyRead = new Set(ranges[machineIds.indexOf(machineId)].readSales.map(({ id }) => id));
        return (await machineSalesDayService.salesIn(businessId, machineId, from, to)).filter(({ id }) => !alreadyRead.has(id)).map((sale) => ({ machineId, ...sale }));
      }),
    );
    return [...read, ...more.flat()]
      .filter(({ machineId, data }) => keep(machineId, data.productId))
      .sort((a, b) => (b.data.dispensedAt?.toMillis() ?? 0) - (a.data.dispensedAt?.toMillis() ?? 0))
      .slice(0, limit);
  }

  /** Customer money returned in the period for sales that never counted as revenue (the product didn't come out). Reads only the refunded ones, every machine at once. */
  private async refundedInPeriod(businessId: string, machineIds: string[], period: ReportingPeriod): Promise<{ count: number; amountKes: number }> {
    const refunded = (await Promise.all(machineIds.map((machineId) => machineTransactionRepository.listByMachineStatusInRange(businessId, machineId, 'refunded', period.start, period.end))))
      .flat()
      .filter(({ data }) => isCustomerSale(data));
    return { count: refunded.length, amountKes: refunded.reduce((sum, { data }) => sum + data.amountKes, 0) };
  }

  /** Names of the products sold, and the snacks among them (whose cost the sales from before frozen costs need). */
  private async products(businessId: string, keys: string[]): Promise<{ names: Map<string, string>; snacks: Map<string, SnackItem> }> {
    const snackIds = keys.filter((key) => key.startsWith('snackItem__')).map((key) => key.slice('snackItem__'.length));
    const packageIds = keys.filter((key) => key.startsWith('package__')).map((key) => key.slice('package__'.length));
    const [snacks, packages] = await Promise.all([snackItemRepository.findManyById(snackIds), Promise.all(packageIds.map((id) => packageRepository.findById(businessId, id)))]);
    const names = new Map<string, string>();
    snacks.forEach((snack, id) => names.set(`snackItem__${id}`, snack.name));
    packageIds.forEach((id, index) => {
      const pkg = packages[index];
      if (pkg) names.set(`package__${id}`, pkg.name);
    });
    return { names, snacks };
  }
}

export const ownerProfitabilityService = new OwnerProfitabilityService();

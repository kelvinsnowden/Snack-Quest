import 'server-only';

import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineSalesDayRepository } from '@/repositories/machineSalesDayRepository';
import { PNL_SALE_FIELDS, legacyUnitCost } from '@/services/machinePnlService';
import { businessHourAndWeekday } from '@/lib/vending/businessClock';
import { nairobiDateKey, shiftKey, startOfKey } from '@/lib/finance/periods';
import { unitCostFor, type SummedSales } from '@/lib/finance/economics';
import { logger } from '@/lib/observability/logger';
import { isCustomerSale, type MachineTransaction, type SnackItem, type SoldProductTotals } from '@/types';

/**
 * How long after midnight a day counts as over. A sale's `dispensedAt` is
 * the database's clock at the moment it completed; this margin covers any
 * difference between that clock and the server's.
 */
const SETTLE_MS = 10 * 60 * 1000;

type Sale = { id: string; data: MachineTransaction };
export type DayProducts = Record<string, SoldProductTotals>;

export interface MachineSalesRange {
  /**
   * The range's sales summed by Nairobi date and product. The first and last
   * day may be partial — summed over the part inside the range. Days with no
   * sales may be absent.
   */
  days: Map<string, DayProducts>;
  /** Days whose figures came from stored summaries — their sales were not read. */
  storedDays: Set<string>;
  /** The sales that were read: every day not in `storedDays`. */
  readSales: Sale[];
}

const dayStart = startOfKey;
const nextKey = (key: string) => shiftKey(key, 1);

function productKey(sale: Pick<MachineTransaction, 'productCatalogue' | 'productId'>): string {
  return `${sale.productCatalogue}__${sale.productId}`;
}

/** Adds one completed sale to a day's product totals. */
function addSale(products: DayProducts, data: MachineTransaction): void {
  const key = productKey(data);
  const product = (products[key] ??= { productId: data.productId, productCatalogue: data.productCatalogue, units: 0, grossKes: 0, ownerCosted: { units: 0, grossKes: 0, costKes: 0 }, legacy: { units: 0, grossKes: 0 }, byHour: {} });
  product.units += 1;
  product.grossKes += data.amountKes;
  if (data.economics) {
    const costKes = unitCostFor(data.economics, 'owner');
    if (costKes !== null) {
      product.ownerCosted.units += 1;
      product.ownerCosted.grossKes += data.amountKes;
      product.ownerCosted.costKes += costKes;
    }
  } else {
    product.legacy.units += 1;
    product.legacy.grossKes += data.amountKes;
  }
  if (data.dispensedAt) {
    const hour = String(businessHourAndWeekday(data.dispensedAt.toDate()).hour);
    const slot = (product.byHour[hour] ??= [0, 0]);
    slot[0] += 1;
    slot[1] += data.amountKes;
  }
}

/** Sales summed by Nairobi date. */
export function sumByDay(sales: Sale[]): Map<string, DayProducts> {
  const days = new Map<string, DayProducts>();
  for (const { data } of sales) {
    if (!data.dispensedAt) continue;
    const date = nairobiDateKey(data.dispensedAt.toDate());
    const products = days.get(date) ?? {};
    addSale(products, data);
    days.set(date, products);
  }
  return days;
}

/**
 * One product's day as owner's profit figures: the frozen owner costs, plus
 * the sales from before costs were frozen costed at the snack's cost today —
 * exactly what the per-sale P&L does with each of those sales.
 */
export function ownerSums(product: SoldProductTotals, snacks: Map<string, SnackItem>): { sums: SummedSales; estimatedUnits: number } {
  const legacyCost = product.legacy.units > 0 ? legacyUnitCost(product, snacks) : null;
  const costed = legacyCost === null ? product.ownerCosted : { units: product.ownerCosted.units + product.legacy.units, grossKes: product.ownerCosted.grossKes + product.legacy.grossKes, costKes: product.ownerCosted.costKes + legacyCost * product.legacy.units };
  return {
    sums: { costed, unpriced: { units: product.units - costed.units, grossKes: product.grossKes - costed.grossKes } },
    estimatedUnits: legacyCost === null ? 0 : product.legacy.units,
  };
}

/**
 * One machine's completed sales over a period, summed by day — the owner's
 * profit page's read. A day that is over comes from its stored summary
 * (`machineSalesDaily`), written here the first time it's needed; the day
 * still in progress, and any part-day at the edge of the range, comes from
 * the sales themselves. A month of a busy machine is about thirty small
 * reads instead of every sale in it.
 */
class MachineSalesDayService {
  async read(businessId: string, machineId: string, since: Date, until: Date, now = new Date()): Promise<MachineSalesRange> {
    const result: MachineSalesRange = { days: new Map(), storedDays: new Set(), readSales: [] };
    if (until <= since) return result;

    // Whole days inside the range that are over.
    const settledBefore = now.getTime() - SETTLE_MS;
    const wholeDays: string[] = [];
    let key = nairobiDateKey(since);
    if (dayStart(key) < since) key = nextKey(key);
    while (dayStart(nextKey(key)).getTime() <= Math.min(until.getTime(), settledBefore)) {
      wholeDays.push(key);
      key = nextKey(key);
    }

    // The part-days at either end are read from the sales whatever is stored, so alongside the stored days.
    const firstWhole = wholeDays.length > 0 ? dayStart(wholeDays[0]) : until;
    const afterWhole = wholeDays.length > 0 ? dayStart(nextKey(wholeDays[wholeDays.length - 1])) : until;
    const [stored, head, tail] = await Promise.all([
      machineSalesDayRepository.getMany(businessId, machineId, wholeDays),
      firstWhole > since ? this.salesIn(businessId, machineId, since, firstWhole) : [],
      until > afterWhole && wholeDays.length > 0 ? this.salesIn(businessId, machineId, afterWhole, until) : [],
    ]);
    const missing = wholeDays.filter((date) => !stored.has(date));

    // Days that are over but not stored yet: read, as few ranges as possible.
    const ranges: { from: Date; to: Date }[] = [];
    for (const date of missing) {
      const last = ranges[ranges.length - 1];
      if (last && last.to.getTime() === dayStart(date).getTime()) last.to = dayStart(nextKey(date));
      else ranges.push({ from: dayStart(date), to: dayStart(nextKey(date)) });
    }
    const gaps = await Promise.all(ranges.map((range) => this.salesIn(businessId, machineId, range.from, range.to)));

    result.readSales = [...head, ...gaps.flat(), ...tail];
    result.days = sumByDay(result.readSales);
    for (const [date, day] of stored) {
      result.days.set(date, day.products);
      result.storedDays.add(date);
    }

    if (missing.length > 0) {
      // The page still shows the right figures if this fails; the day is just read again next time.
      await machineSalesDayRepository
        .putMany(missing.map((date) => ({ businessId, machineId, date, products: result.days.get(date) ?? {} })))
        .catch((error: unknown) => logger.error('machine sales days not stored', { machineId, days: missing.length, error: error instanceof Error ? error.message : String(error) }));
    }
    return result;
  }

  /** The completed customer sales in `[from, to)`, oldest first. */
  async salesIn(businessId: string, machineId: string, from: Date, to: Date): Promise<Sale[]> {
    const sales: Sale[] = [];
    for await (const sale of machineTransactionRepository.streamDispensedInRange(businessId, { machineId, since: from, until: to, fields: PNL_SALE_FIELDS })) {
      if (isCustomerSale(sale.data)) sales.push(sale);
    }
    return sales;
  }

  /**
   * Rebuilds the stored days in `[fromKey, toKey]` from the sales — for after
   * someone corrects sales by hand, which is the only way a day that is over
   * can change. Days not over yet are left alone.
   */
  async rebuild(businessId: string, machineId: string, fromKey: string, toKey: string, now = new Date()): Promise<{ days: number }> {
    const settledBefore = now.getTime() - SETTLE_MS;
    const dates: string[] = [];
    for (let date = fromKey; date <= toKey && dayStart(nextKey(date)).getTime() <= settledBefore; date = nextKey(date)) dates.push(date);
    if (dates.length === 0) return { days: 0 };
    const days = sumByDay(await this.salesIn(businessId, machineId, dayStart(dates[0]), dayStart(nextKey(dates[dates.length - 1]))));
    await machineSalesDayRepository.putMany(dates.map((date) => ({ businessId, machineId, date, products: days.get(date) ?? {} })));
    return { days: dates.length };
  }
}

export const machineSalesDayService = new MachineSalesDayService();
export { MachineSalesDayService };

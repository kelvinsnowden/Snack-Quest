import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { ownerProfitabilityService, type OwnerProfitabilityFilters } from '@/services/ownerProfitabilityService';
import { machinePnlService } from '@/services/machinePnlService';
import { machineSalesDayService } from '@/services/machineSalesDayService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { businessHourAndWeekday } from '@/lib/vending/businessClock';
import { productEconomics } from '@/lib/finance/economics';
import { nairobiDateKey, previousPeriod, resolvePeriod, startOfKey, type ReportingPeriod } from '@/lib/finance/periods';

/**
 * The owner's profit page reads each machine's sales summed by day instead of
 * every sale. These tests hold it to the per-sale P&L: the same figures, to
 * the shilling, whichever days were summed and whichever were read.
 */

const BUSINESS_ID = 'biz-owner-profit-days';
const PARTNER_ID = 'owner-days';
const COLLECTIONS = ['machines', 'machineTransactions', 'machineAssortments', 'snackItems', 'machineSalesDaily', 'partnerMachineAgreements', 'machineSettlements', 'maintenanceCosts'];
/** Midday in Nairobi on 20 October 2026. */
const NOW = new Date('2026-10-20T09:00:00Z');
const HOUR = 60 * 60 * 1000;

async function clear() {
  for (const collection of COLLECTIONS) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(clear);
afterEach(() => vi.restoreAllMocks());

let saleCount = 0;
async function sale(machineId: string, at: Date, input: { productId: string; amountKes: number; ownerCostKes?: number | null; legacy?: boolean; diagnostic?: boolean; catalogue?: 'snackItem' | 'package' }) {
  saleCount += 1;
  const id = `sale-${saleCount}`;
  await adminFirestore.collection('machineTransactions').doc(id).set({
    businessId: BUSINESS_ID,
    machineId,
    slotId: 'A01',
    productId: input.productId,
    productCatalogue: input.catalogue ?? 'snackItem',
    amountKes: input.amountKes,
    paymentMethod: input.diagnostic ? 'diagnostic' : 'mpesa',
    transactionRef: `TX-${saleCount}`,
    status: 'dispensed',
    dispensedAt: Timestamp.fromDate(at),
    createdAt: Timestamp.fromDate(at),
    updatedAt: Timestamp.fromDate(at),
    ...(input.legacy ? {} : { economics: { landedCostKes: 180, ownerWholesaleKes: input.ownerCostKes === undefined ? 250 : input.ownerCostKes, ownerCostBasis: 'wholesale_price' } }),
  });
  return id;
}

async function machine(id: string, ownerSince: Date | null = null) {
  await adminFirestore.collection('machines').doc(id).set({ businessId: BUSINESS_ID, machineCode: id.toUpperCase(), ownerPartnerId: PARTNER_ID, ownershipType: 'third_party', locationId: null, status: 'active', ownerSince: ownerSince ? Timestamp.fromDate(ownerSince) : null });
}

async function seed() {
  saleCount = 0;
  await adminFirestore.collection('snackItems').doc('pocky').set({ businessId: BUSINESS_ID, name: 'Pocky', expectedUnitCostKes: 180, costPending: false });
  await adminFirestore.collection('snackItems').doc('ramune').set({ businessId: BUSINESS_ID, name: 'Ramune', expectedUnitCostKes: 120, costPending: false });
  for (const [machineId, productId, category] of [['m1', 'pocky', 'biscuits'], ['m1', 'ramune', 'drinks'], ['m2', 'pocky', 'biscuits']]) {
    await adminFirestore.collection('machineAssortments').doc(`${machineId}__${productId}`).set({ businessId: BUSINESS_ID, machineId, productId, category, displayOrder: 1, assorted: true, slotCode: 'A01' });
  }
  await machine('m1');
  // m2 became this owner's at 14:00 on the 15th: its sales that morning are not theirs.
  await machine('m2', new Date('2026-10-15T11:00:00Z'));
  const day = (key: string, hour: number) => new Date(startOfKey(key).getTime() + hour * HOUR);
  await sale('m1', day('2026-10-20', 9), { productId: 'pocky', amountKes: 350 });
  await sale('m1', day('2026-10-20', 10), { productId: 'ramune', amountKes: 200, ownerCostKes: null });
  await sale('m2', day('2026-10-20', 8), { productId: 'pocky', amountKes: 350 });
  await sale('m1', day('2026-10-19', 22), { productId: 'pocky', amountKes: 350 });
  await sale('m1', day('2026-10-18', 13), { productId: 'pocky', amountKes: 300, legacy: true });
  await sale('m1', day('2026-10-18', 13.5), { productId: 'ramune', amountKes: 200, ownerCostKes: 90 });
  await sale('m1', day('2026-10-18', 14), { productId: 'ramune', amountKes: 150, diagnostic: true });
  await sale('m2', day('2026-10-15', 9), { productId: 'pocky', amountKes: 350 }); // before m2 was theirs
  await sale('m2', day('2026-10-15', 16), { productId: 'pocky', amountKes: 350 });
  await sale('m2', day('2026-10-02', 7), { productId: 'pocky', amountKes: 400 });
  await sale('m1', day('2026-09-10', 12), { productId: 'pocky', amountKes: 350 }); // previous 30 days
  await sale('m1', day('2026-09-15', 12), { productId: 'ramune', amountKes: 200, ownerCostKes: 90 });
  await sale('m1', day('2026-10-22', 12), { productId: 'pocky', amountKes: 999 }); // after NOW: outside every period here
}

/** The report the old way: every sale read and costed one by one by `machinePnlService.forMachine`. */
async function saleBySale(period: ReportingPeriod, filters: OwnerProfitabilityFilters = {}) {
  const categories = new Map([['m1__pocky', 'biscuits'], ['m1__ramune', 'drinks'], ['m2__pocky', 'biscuits']]);
  const keep = (machineId: string, productId: string) => (!filters.productId || productId === filters.productId) && (!filters.category || categories.get(`${machineId}__${productId}`) === filters.category);
  const owned = [{ id: 'm1', since: null }, { id: 'm2', since: new Date('2026-10-15T11:00:00Z') }].filter(({ id }) => !filters.machineId || id === filters.machineId);
  const read = async (range: ReportingPeriod) =>
    (await Promise.all(owned.map(async ({ id, since }) => ({ id, pnl: await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId: id, periodStart: since && since > range.start ? since : range.start, periodEnd: range.end, perspective: 'owner' }) })))).flatMap(({ id, pnl }) => pnl.sales.filter((s) => keep(id, s.productId)).map((s) => ({ machineId: id, sale: s })));
  const current = await read(period);
  const before = await read(previousPeriod(period));
  const economicsOf = (sales: typeof current) => productEconomics(sales.map(({ sale: s }) => ({ units: 1, grossKes: s.retailPriceKes, unitCostKes: s.unitCostKes })));
  const byDay = new Map<string, { revenueKes: number; grossProfitKes: number; units: number }>();
  const byHour = new Map<number, { revenueKes: number; units: number }>();
  for (const { sale: s } of current) {
    const date = nairobiDateKey(s.dispensedAt!);
    const entry = byDay.get(date) ?? { revenueKes: 0, grossProfitKes: 0, units: 0 };
    byDay.set(date, { revenueKes: entry.revenueKes + s.retailPriceKes, grossProfitKes: entry.grossProfitKes + (s.grossProfitKes ?? 0), units: entry.units + 1 });
    const { hour } = businessHourAndWeekday(s.dispensedAt!);
    const slot = byHour.get(hour) ?? { revenueKes: 0, units: 0 };
    byHour.set(hour, { revenueKes: slot.revenueKes + s.retailPriceKes, units: slot.units + 1 });
  }
  const totals = economicsOf(current);
  const previous = economicsOf(before);
  return {
    totals,
    previous: { netRevenueKes: previous.netRevenueKes, grossProfitKes: previous.grossProfitKes, units: previous.units },
    byDay,
    byHour,
    byMachine: owned.map(({ id }) => ({ machineId: id, ...economicsOf(current.filter((s) => s.machineId === id)) })),
    estimatedCostUnits: current.filter(({ sale: s }) => s.costEstimated).length,
    saleIds: current.sort((a, b) => b.sale.dispensedAt!.getTime() - a.sale.dispensedAt!.getTime()).map(({ sale: s }) => s.id),
  };
}

async function expectSameAsSaleBySale(period: ReportingPeriod, filters: OwnerProfitabilityFilters = {}, saleLimit = 200) {
  const report = await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, filters, saleLimit, NOW);
  const expected = await saleBySale(period, filters);
  expect(report.totals).toMatchObject(expected.totals);
  expect(report.previous).toEqual(expected.previous);
  expect(report.byDay.filter((day) => day.units > 0)).toEqual([...expected.byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => ({ date, ...day })));
  expect(report.byHour.filter((hour) => hour.units > 0)).toEqual([...expected.byHour].sort(([a], [b]) => a - b).map(([hour, slot]) => ({ hour, ...slot })));
  expect(report.byMachine.map(({ machineId, revenueKes, grossProfitKes, grossMarginPct, units }) => ({ machineId, revenueKes, grossProfitKes, grossMarginPct, units }))).toEqual(
    expected.byMachine.map(({ machineId, netRevenueKes, grossProfitKes, grossMarginPct, units }) => ({ machineId, revenueKes: netRevenueKes, grossProfitKes, grossMarginPct, units })),
  );
  expect(report.notes.estimatedCostUnits).toBe(expected.estimatedCostUnits);
  expect(report.sales.map((s) => s.id)).toEqual(expected.saleIds.slice(0, saleLimit));
  return report;
}

describe('owner profit from sales summed by day', () => {
  it('the last 30 days: the per-sale figures exactly; finished days stored, today not', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    const report = await expectSameAsSaleBySale(period);
    expect(report.totals.units).toBe(7);
    // Pocky on the 18th was sold before costs were frozen on sales: costed at today's 180, and said so.
    expect(report.notes.estimatedCostUnits).toBe(1);
    expect(report.totals.unpricedUnits).toBe(1);

    const stored = await adminFirestore.collection('machineSalesDaily').where('businessId', '==', BUSINESS_ID).get();
    const dates = stored.docs.map((doc) => doc.data().date as string);
    expect(dates).toContain('2026-10-19');
    expect(dates).toContain('2026-10-03'); // a day without sales is stored too
    expect(dates).not.toContain('2026-10-20'); // today is still selling
    expect(stored.docs.some((doc) => doc.id === 'm2__2026-10-15')).toBe(false); // the day m2 changed hands is partial for this owner
  });

  it('a second look reads only today’s sales (and the part-day m2 changed hands), and still matches', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 3, NOW);
    const reads = vi.spyOn(machineTransactionRepository, 'streamDispensedInRange');
    await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 3, NOW);
    const ranges = reads.mock.calls.map(([, options]) => ({ machineId: options.machineId, since: options.since.toISOString(), until: options.until.toISOString() }));
    vi.restoreAllMocks();
    const today = startOfKey('2026-10-20').toISOString();
    expect(ranges).toEqual(
      expect.arrayContaining([
        { machineId: 'm1', since: today, until: period.end.toISOString() },
        { machineId: 'm2', since: '2026-10-15T11:00:00.000Z', until: startOfKey('2026-10-16').toISOString() },
        { machineId: 'm2', since: today, until: period.end.toISOString() },
      ]),
    );
    expect(ranges).toHaveLength(3);
    await expectSameAsSaleBySale(period, {}, 3);
  });

  it('filters by machine, product and category match the per-sale figures', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    await expectSameAsSaleBySale(period, { machineId: 'm2' });
    await expectSameAsSaleBySale(period, { productId: 'ramune' });
    await expectSameAsSaleBySale(period, { category: 'biscuits' });
  });

  it('the list of latest sales reaches back into stored days when today has too few', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    await expectSameAsSaleBySale(period, {}, 200);
    // Now every finished day is stored; a list of 5 needs today's 3 and two from earlier days.
    const report = await expectSameAsSaleBySale(period, {}, 5);
    expect(report.sales).toHaveLength(5);
  });

  it('a sale from before frozen costs is costed at the snack’s cost today, even on a stored day', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    const before = await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 200, NOW);
    await adminFirestore.collection('snackItems').doc('pocky').update({ expectedUnitCostKes: 200 });
    const after = await expectSameAsSaleBySale(period);
    // One estimated unit, 20 shillings dearer.
    expect(after.totals.grossProfitKes).toBe(before.totals.grossProfitKes - 20);
  });

  it('the previous period comes entirely from stored days and matches', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 200, NOW);
    const report = await expectSameAsSaleBySale(period);
    expect(report.previous.units).toBe(2);
    expect(report.previous.netRevenueKes).toBe(550);
  });

  it('a stored day only changes through a rebuild — the path for sales corrected by hand', async () => {
    await seed();
    const period = resolvePeriod({ preset: '30d' }, NOW);
    const first = await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 200, NOW);
    const corrected = await adminFirestore.collection('machineTransactions').where('businessId', '==', BUSINESS_ID).where('transactionRef', '==', 'TX-4').get();
    await corrected.docs[0].ref.delete(); // m1's sale late on the 19th
    const stale = await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 200, NOW);
    expect(stale.totals.units).toBe(first.totals.units);
    const rebuilt = await machineSalesDayService.rebuild(BUSINESS_ID, 'm1', '2026-10-01', '2026-10-20', NOW);
    expect(rebuilt.days).toBe(19); // the 20th isn't over
    const fresh = await ownerProfitabilityService.report(BUSINESS_ID, PARTNER_ID, period, {}, 200, NOW);
    expect(fresh.totals.units).toBe(first.totals.units - 1);
  });

  it('today is read straight from the sales; only yesterday, the day it is compared with, is stored', async () => {
    await seed();
    await expectSameAsSaleBySale(resolvePeriod({ preset: 'today' }, NOW));
    const stored = await adminFirestore.collection('machineSalesDaily').where('businessId', '==', BUSINESS_ID).get();
    expect(stored.docs.map((doc) => doc.id).sort()).toEqual(['m1__2026-10-19', 'm2__2026-10-19']);
  });
});

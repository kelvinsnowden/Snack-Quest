import 'server-only';

import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { fulfillmentAccountingService } from '@/services/fulfillmentAccountingService';
import { machinePnlService } from '@/services/machinePnlService';
import { machineDealService } from '@/services/machineDealService';
import { machineRepository } from '@/repositories/machineRepository';
import { nairobiClock } from '@/lib/ads/playlist';

const DAY_MS = 24 * 60 * 60 * 1000;
export const INCOME_WINDOWS = [30, 90, 365] as const;

/** One way Snack Quest makes money. A null figure is unknown, never zero. */
export interface IncomeLine {
  key: 'website' | 'own_machines' | 'owner_machines' | 'machine_deals';
  label: string;
  /** Money customers paid Snack Quest on this line; null where the line is income, not sales (owner machines). */
  revenueKes: number | null;
  /** Profit before overheads, from what is recorded. */
  profitKes: number;
  /** What the profit figure is, in words. */
  profitBasis: string;
  /** Revenue whose cost isn't recorded, so it is not in the profit. */
  revenueWithoutCostKes: number;
  notes: string[];
}

export interface CombinedIncome {
  days: number;
  since: string;
  lines: IncomeLine[];
  /** Lines the viewer may not see, named rather than silently dropped from the totals. */
  hiddenLines: IncomeLine['key'][];
  totals: { revenueKes: number; profitKes: number; revenueWithoutCostKes: number };
  /** Owners' own machine sales in the window: their money, shown so it is visibly not counted as ours. */
  ownersMachineSalesKes: number | null;
}

/**
 * Everything Snack Quest earned, in one place (§ COMBINED INCOME): website
 * and WhatsApp orders, its own machines, its income from owners' machines,
 * and machines sold to owners. Every figure comes from the calculation that
 * already owns it — the Revenue page, fulfilment accounting, the machine
 * P&L, machine deals — so this page can never disagree with them.
 *
 * Owners' machine sales are the owners' money: only what Snack Quest earns
 * from those machines (wholesale margin, subscription, its ad share, less
 * maintenance it paid) is counted. Profit is before overheads, and only
 * where costs are recorded; revenue without a recorded cost is reported
 * beside it, never counted as profit.
 */
class CombinedIncomeService {
  async forWindow(businessId: string, days: number, access: { website: boolean; machines: boolean; deals: boolean }): Promise<CombinedIncome> {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const lines: IncomeLine[] = [];
    const hiddenLines: IncomeLine['key'][] = [];
    let ownersMachineSalesKes: number | null = null;

    if (access.website) {
      const [revenue, accounting] = await Promise.all([businessAnalyticsService.getRevenueOverview(businessId, days), fulfillmentAccountingService.getOverview(businessId, days)]);
      const notes = [`Revenue as on the Revenue page: paid orders, delivery fees included, give-aways left out.`];
      if (accounting.uncosted.orderCount > 0) notes.push(`${accounting.uncosted.orderCount} paid order${accounting.uncosted.orderCount === 1 ? ' has' : 's have'} no cost recorded yet (Fulfilment page).`);
      lines.push({
        key: 'website',
        label: 'Website and WhatsApp orders',
        revenueKes: revenue.totalRevenueKes,
        profitKes: accounting.costed.grossProfitKes,
        profitBasis: 'Order revenue less the snacks, packaging and delivery recorded against it.',
        revenueWithoutCostKes: accounting.uncosted.revenueKes,
        notes,
      });
    } else hiddenLines.push('website');

    if (access.machines) {
      const machines = await machineRepository.listAllForBusiness(businessId);
      const own = { revenue: 0, profit: 0, withoutCost: 0, machines: 0, paymentFeesMissing: false, estimatedUnits: 0 };
      const owners = { income: 0, maintenance: 0, unpricedUnits: 0, machines: 0, sales: 0 };
      for (const { id } of machines) {
        const pnl = await machinePnlService.forMachine({ businessId, machineId: id, periodStart: since, periodEnd: now, perspective: 'snack_quest' });
        if (pnl.snackQuestIncome) {
          if (pnl.product.units === 0 && pnl.snackQuestIncome.totalKes === 0 && pnl.snackQuestIncome.maintenanceKes === 0) continue;
          owners.machines += 1;
          owners.income += pnl.snackQuestIncome.totalKes;
          owners.maintenance += pnl.snackQuestIncome.maintenanceKes;
          owners.unpricedUnits += pnl.snackQuestIncome.wholesaleUnpricedUnits;
          owners.sales += pnl.product.netRevenueKes;
        } else {
          if (pnl.product.units === 0 && pnl.contribution.contributionProfitKes === 0) continue;
          own.machines += 1;
          own.revenue += pnl.product.netRevenueKes;
          own.profit += pnl.contribution.contributionProfitKes;
          own.withoutCost += pnl.product.unpricedNetRevenueKes;
          own.estimatedUnits += pnl.estimatedCostUnits;
          if (pnl.contribution.missing.includes('payment_fees')) own.paymentFeesMissing = true;
        }
      }
      const ownNotes = [`${own.machines} machine${own.machines === 1 ? '' : 's'} with activity in the period.`];
      if (own.paymentFeesMissing) ownNotes.push('M-Pesa fees are not recorded yet, so they are not taken off.');
      if (own.estimatedUnits > 0) ownNotes.push(`${own.estimatedUnits} older sale${own.estimatedUnits === 1 ? ' was' : 's were'} costed at today’s cost because they predate cost snapshots.`);
      lines.push({
        key: 'own_machines',
        label: 'Snack Quest’s own machines',
        revenueKes: own.revenue,
        profitKes: own.profit,
        profitBasis: 'Snack sales less their cost, location commission and maintenance, plus advertising (the machine P&L’s contribution).',
        revenueWithoutCostKes: own.withoutCost,
        notes: ownNotes,
      });
      const ownerNotes = [`${owners.machines} owner machine${owners.machines === 1 ? '' : 's'} with activity. The snack sales on them are the owners’ money and aren’t counted here.`];
      if (owners.unpricedUnits > 0) ownerNotes.push(`${owners.unpricedUnits} unit${owners.unpricedUnits === 1 ? '' : 's'} sold at a wholesale price with no cost recorded, so their margin isn’t counted.`);
      if (owners.maintenance > 0) ownerNotes.push(`Maintenance Snack Quest paid on these machines is taken off.`);
      lines.push({
        key: 'owner_machines',
        label: 'Income from owners’ machines',
        revenueKes: null,
        profitKes: owners.income - owners.maintenance,
        profitBasis: 'Wholesale margin on stock sold, subscriptions charged and Snack Quest’s share of advertising, less maintenance Snack Quest paid.',
        revenueWithoutCostKes: 0,
        notes: ownerNotes,
      });
      ownersMachineSalesKes = owners.sales;
    } else hiddenLines.push('own_machines', 'owner_machines');

    if (access.deals) {
      const sinceDate = nairobiClock(since).date;
      const sold = (await machineDealService.forFleet(businessId)).filter((row) => row.deal?.sale && row.deal.sale.soldOn >= sinceDate);
      const complete = sold.filter((row) => row.summary.profitKes !== null);
      const incomplete = sold.filter((row) => row.summary.profitKes === null);
      const notes = [`${sold.length} machine${sold.length === 1 ? '' : 's'} sold in the period.`];
      if (incomplete.length > 0) notes.push(`${incomplete.length} still need${incomplete.length === 1 ? 's' : ''} their landed or installation cost recorded (Machine deals).`);
      lines.push({
        key: 'machine_deals',
        label: 'Machines sold to owners',
        revenueKes: sold.reduce((sum, row) => sum + (row.summary.saleRevenueKes ?? 0), 0),
        profitKes: complete.reduce((sum, row) => sum + (row.summary.profitKes ?? 0), 0),
        profitBasis: 'Sale price (and installation charged) less landed and installation cost.',
        revenueWithoutCostKes: incomplete.reduce((sum, row) => sum + (row.summary.saleRevenueKes ?? 0), 0),
        notes,
      });
    } else hiddenLines.push('machine_deals');

    return {
      days,
      since: since.toISOString(),
      lines,
      hiddenLines,
      totals: {
        revenueKes: lines.reduce((sum, line) => sum + (line.revenueKes ?? 0), 0),
        profitKes: lines.reduce((sum, line) => sum + line.profitKes, 0),
        revenueWithoutCostKes: lines.reduce((sum, line) => sum + line.revenueWithoutCostKes, 0),
      },
      ownersMachineSalesKes,
    };
  }
}

export const combinedIncomeService = new CombinedIncomeService();

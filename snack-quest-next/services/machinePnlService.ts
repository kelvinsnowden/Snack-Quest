import 'server-only';

import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineSettlementRepository } from '@/repositories/machineSettlementRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { advertisingService } from '@/services/advertisingService';
import { contribution, productEconomics, shareOf, unitCostFor, wholesaleMargin, type Contribution, type EconomicPerspective, type ProductEconomics, type SaleLine } from '@/lib/finance/economics';
import { isCustomerSale, type MachineEconomicProfile, type MachineTransaction } from '@/types';

/** One sale as a line of the P&L, with the cost from the perspective asked for. */
export interface PnlSale {
  id: string;
  transactionRef: string;
  productId: string;
  productCatalogue: MachineTransaction['productCatalogue'];
  slotId: string;
  dispensedAt: Date | null;
  retailPriceKes: number;
  unitCostKes: number | null;
  /** True when the sale predates cost snapshots and was costed at today's landed cost. */
  costEstimated: boolean;
  grossProfitKes: number | null;
  grossMarginPct: number | null;
}

export interface MachinePnl {
  machineId: string;
  perspective: EconomicPerspective;
  periodStart: string;
  periodEnd: string;
  profile: MachineEconomicProfile;
  product: ProductEconomics;
  contribution: Contribution;
  /** Units costed at today's landed cost because the sale predates snapshots. */
  estimatedCostUnits: number;
  /**
   * For an owner's machine seen from Snack Quest: what Snack Quest earned from
   * it — the wholesale margin on units sold, the subscription and its share of
   * advertising. Null for Snack Quest's own machines and for the owner's view.
   */
  snackQuestIncome: { wholesaleMarginKes: number; wholesaleUnpricedUnits: number; subscriptionKes: number; adShareKes: number; totalKes: number } | null;
  /** Advertising attributed to this machine in the period, before any owner share; months with plays whose revenue hasn't been computed are named. */
  advertising: { grossKes: number; uncomputedMonths: string[] };
  sales: PnlSale[];
}

export interface PnlCosts {
  /** Advertising revenue attributed to this machine in the period (gross, before any owner share). */
  adRevenueKes?: number;
}

/**
 * The machine P&L (§ MACHINE-LEVEL P&L), built only from the financial engine
 * (`lib/finance/economics.ts`). Two perspectives:
 *
 * - **Snack Quest**, for its own machine: revenue − COGS at landed cost −
 *   payment fees − location commission − maintenance + advertising =
 *   contribution. For an owner's machine the product sales are the owner's,
 *   so the Snack Quest view is its income from the machine
 *   (`snackQuestIncome`), with the owner's product P&L shown alongside.
 * - **Owner**: revenue − COGS at the owner's cost basis − subscription −
 *   location commission + the owner's advertising share. Never contains
 *   Snack Quest's landed cost unless the agreement allows it.
 *
 * Costs the system doesn't hold (payment fees, maintenance) are left out and
 * named in `contribution.missing` — never assumed. The result is labelled
 * contribution, never "net profit".
 */
class MachinePnlService {
  async forMachine(input: { businessId: string; machineId: string; periodStart: Date; periodEnd: Date; perspective: EconomicPerspective; costs?: PnlCosts }): Promise<MachinePnl> {
    const profile = await machineEconomicProfileService.resolve(input.businessId, input.machineId);
    const sales: { id: string; data: MachineTransaction }[] = [];
    for await (const sale of machineTransactionRepository.streamDispensedInRange(input.businessId, { machineId: input.machineId, since: input.periodStart, until: input.periodEnd })) {
      if (isCustomerSale(sale.data)) sales.push(sale);
    }

    // Sales from before snapshots existed: today's landed cost of a snack is the only cost there is. Counted and labelled.
    const legacySnackIds = [...new Set(sales.filter(({ data }) => !data.economics && data.productCatalogue === 'snackItem').map(({ data }) => data.productId))];
    const legacySnacks = legacySnackIds.length > 0 ? await snackItemRepository.findManyById(legacySnackIds) : new Map();

    // The owner view of an owner's machine uses the owner's cost; everything else is Snack Quest's cost.
    const costPerspective: EconomicPerspective = input.perspective === 'owner' || profile.settlesWithOwner ? 'owner' : 'snack_quest';
    let estimatedCostUnits = 0;
    const pnlSales: PnlSale[] = [];
    const lines: SaleLine[] = [];
    const wholesaleLines: { units: number; ownerWholesaleKes: number | null; landedCostKes: number | null }[] = [];
    for (const { id, data } of sales) {
      let unitCostKes: number | null;
      let costEstimated = false;
      if (data.economics) {
        unitCostKes = unitCostFor(data.economics, costPerspective);
        if (data.economics.ownerCostBasis === 'wholesale_price') {
          wholesaleLines.push({ units: 1, ownerWholesaleKes: data.economics.ownerWholesaleKes, landedCostKes: data.economics.landedCostKes });
        }
      } else {
        const snack = data.productCatalogue === 'snackItem' ? legacySnacks.get(data.productId) : undefined;
        unitCostKes = snack && !snack.costPending ? snack.expectedUnitCostKes : null;
        costEstimated = unitCostKes !== null;
        if (costEstimated) estimatedCostUnits += 1;
      }
      lines.push({ units: 1, grossKes: data.amountKes, unitCostKes });
      const lineEconomics = productEconomics([{ units: 1, grossKes: data.amountKes, unitCostKes }]);
      pnlSales.push({
        id,
        transactionRef: data.transactionRef,
        productId: data.productId,
        productCatalogue: data.productCatalogue,
        slotId: data.slotId,
        dispensedAt: data.dispensedAt ? data.dispensedAt.toDate() : null,
        retailPriceKes: data.amountKes,
        unitCostKes,
        costEstimated,
        grossProfitKes: unitCostKes === null ? null : lineEconomics.grossProfitKes,
        grossMarginPct: unitCostKes === null ? null : lineEconomics.grossMarginPct,
      });
    }

    const product = productEconomics(lines);
    const subscriptionKes = profile.settlesWithOwner ? await this.subscriptionSettledInPeriod(input.businessId, input.machineId, input.periodStart, input.periodEnd) : 0;
    const locationCommissionKes = profile.locationCommissionPct === null ? null : shareOf(product.netRevenueKes, profile.locationCommissionPct);
    const advertising = input.costs?.adRevenueKes !== undefined ? { grossKes: input.costs.adRevenueKes, uncomputedMonths: [] } : await advertisingService.machineAdRevenue(input.businessId, input.machineId, input.periodStart, input.periodEnd);
    const adRevenueKes = advertising.grossKes;
    const ownerAdShareKes = profile.settlesWithOwner ? shareOf(adRevenueKes, profile.terms.adRevenueSharePartnerPct) : 0;

    const ownersView = input.perspective === 'owner' || profile.settlesWithOwner;
    const result = contribution(product, {
      // Neither the business's M-Pesa tariff nor maintenance costs are recorded yet: reported as missing, never guessed.
      paymentFeesKes: null,
      locationCommissionKes,
      subscriptionKes: ownersView ? subscriptionKes : 0,
      maintenanceKes: profile.terms.maintenanceResponsibility === 'owner' || !ownersView ? null : 0,
      adRevenueKes: ownersView ? ownerAdShareKes : adRevenueKes,
    });

    let snackQuestIncome: MachinePnl['snackQuestIncome'] = null;
    if (input.perspective === 'snack_quest' && profile.settlesWithOwner) {
      const wholesale = wholesaleMargin(wholesaleLines);
      const adShareKes = adRevenueKes - ownerAdShareKes;
      snackQuestIncome = {
        wholesaleMarginKes: wholesale.marginKes,
        wholesaleUnpricedUnits: wholesale.unpricedUnits,
        subscriptionKes,
        adShareKes,
        totalKes: wholesale.marginKes + subscriptionKes + adShareKes,
      };
    }

    return {
      machineId: input.machineId,
      perspective: input.perspective,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      profile,
      product,
      contribution: result,
      estimatedCostUnits,
      snackQuestIncome,
      advertising: ownersView ? { grossKes: ownerAdShareKes, uncomputedMonths: advertising.uncomputedMonths } : advertising,
      sales: pnlSales,
    };
  }

  /** Subscription charged by settlements lying inside the period — what was actually charged, never a prorated guess. */
  private async subscriptionSettledInPeriod(businessId: string, machineId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const settlements = await machineSettlementRepository.listByMachine(businessId, machineId);
    return settlements
      .filter(({ data }) => data.status !== 'draft' && data.periodStart.toMillis() >= periodStart.getTime() && data.periodEnd.toMillis() <= periodEnd.getTime())
      .reduce((sum, { data }) => sum + data.subscriptionChargedKes, 0);
  }
}

export const machinePnlService = new MachinePnlService();

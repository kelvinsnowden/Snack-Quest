import 'server-only';

import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineSettlementRepository } from '@/repositories/machineSettlementRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { advertisingService } from '@/services/advertisingService';
import { maintenanceService } from '@/services/maintenanceService';
import { contribution, productEconomics, shareOf, unitCostFor, wholesaleMargin, type Contribution, type EconomicPerspective, type ProductEconomics, type SaleLine } from '@/lib/finance/economics';
import { isCustomerSale, type MachineEconomicProfile, type MachineTransaction, type SnackItem } from '@/types';

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
  snackQuestIncome: {
    wholesaleMarginKes: number;
    wholesaleUnpricedUnits: number;
    subscriptionKes: number;
    adShareKes: number;
    totalKes: number;
    /** Maintenance Snack Quest paid for on this owner's machine in the period. */
    maintenanceKes: number;
    /** `totalKes` less that maintenance. */
    afterMaintenanceKes: number;
  } | null;
  /** Advertising attributed to this machine in the period, before any owner share; months with plays whose revenue hasn't been computed are named. */
  advertising: { grossKes: number; uncomputedMonths: string[] };
  sales: PnlSale[];
}

export interface PnlCosts {
  /** Advertising revenue attributed to this machine in the period (gross, before any owner share). */
  adRevenueKes?: number;
}

/** Everything the P&L reads from a sale — the rest of each record isn't fetched. */
export const PNL_SALE_FIELDS: (keyof MachineTransaction)[] = ['amountKes', 'dispensedAt', 'productCatalogue', 'productId', 'slotId', 'transactionRef', 'economics', 'paymentMethod'];

type CostedFields = Pick<MachineTransaction, 'economics' | 'productCatalogue' | 'productId'>;

/**
 * What one unit of a sale cost from `perspective`: the cost frozen on the
 * sale itself, or — for a sale from before costs were frozen on each sale —
 * the snack's landed cost today, flagged as estimated. `snacks` holds the
 * snacks of such sales.
 */
function costOfSale(data: CostedFields, perspective: EconomicPerspective, snacks: Map<string, SnackItem>): { unitCostKes: number | null; costEstimated: boolean } {
  if (data.economics) return { unitCostKes: unitCostFor(data.economics, perspective), costEstimated: false };
  const unitCostKes = legacyUnitCost(data, snacks);
  return { unitCostKes, costEstimated: unitCostKes !== null };
}

/** Today's cost of a product sold before costs were frozen on each sale: a snack's landed cost while it is known; a package has none. */
export function legacyUnitCost(product: Pick<MachineTransaction, 'productCatalogue' | 'productId'>, snacks: Map<string, SnackItem>): number | null {
  const snack = product.productCatalogue === 'snackItem' ? snacks.get(product.productId) : undefined;
  return snack && !snack.costPending ? snack.expectedUnitCostKes : null;
}

/** Snacks whose cost the sales from before frozen costs need. */
export async function snacksForLegacySales(sales: { data: CostedFields }[]): Promise<Map<string, SnackItem>> {
  const ids = [...new Set(sales.filter(({ data }) => !data.economics && data.productCatalogue === 'snackItem').map(({ data }) => data.productId))];
  return ids.length > 0 ? snackItemRepository.findManyById(ids) : new Map();
}

/** One sale as a P&L line. */
export function pnlSaleOf(id: string, data: MachineTransaction, perspective: EconomicPerspective, snacks: Map<string, SnackItem>): PnlSale {
  const { unitCostKes, costEstimated } = costOfSale(data, perspective, snacks);
  const lineEconomics = productEconomics([{ units: 1, grossKes: data.amountKes, unitCostKes }]);
  return {
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
  };
}

export interface PnlInput {
  businessId: string;
  machineId: string;
  periodStart: Date;
  periodEnd: Date;
  perspective: EconomicPerspective;
  costs?: PnlCosts;
}

/** The recorded costs and income below gross profit for one machine and period. */
export interface PnlCostReads {
  subscriptionKes: number;
  advertising: { grossKes: number; uncomputedMonths: string[] };
  maintenance: Awaited<ReturnType<typeof maintenanceService.forPnl>>;
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
 * Maintenance is what was recorded in the maintenance ledger for the
 * period, split by who bore it. An owner's own spend is only known when it
 * was recorded: an owner responsible for maintenance with nothing recorded
 * shows it as missing, not zero. Costs the system doesn't hold (payment
 * fees) are left out and named in `contribution.missing` — never assumed.
 * The result is labelled contribution, never "net profit".
 */
class MachinePnlService {
  async forMachine(input: PnlInput): Promise<MachinePnl> {
    const profile = await machineEconomicProfileService.resolve(input.businessId, input.machineId);
    // The costs below gross profit don't depend on the sales, so they are read while the sales are.
    const [sales, costs] = await Promise.all([this.salesOf(input), this.costsBelowGrossProfit(input, profile)]);
    const snacks = await snacksForLegacySales(sales);

    // The owner view of an owner's machine uses the owner's cost; everything else is Snack Quest's cost.
    const costPerspective: EconomicPerspective = input.perspective === 'owner' || profile.settlesWithOwner ? 'owner' : 'snack_quest';
    const pnlSales = sales.map(({ id, data }) => pnlSaleOf(id, data, costPerspective, snacks));
    const wholesaleLines = sales.flatMap(({ data }) => (data.economics?.ownerCostBasis === 'wholesale_price' ? [{ units: 1, ownerWholesaleKes: data.economics.ownerWholesaleKes, landedCostKes: data.economics.landedCostKes }] : []));
    const product = productEconomics(pnlSales.map((sale): SaleLine => ({ units: 1, grossKes: sale.retailPriceKes, unitCostKes: sale.unitCostKes })));
    return this.assemble(input, profile, product, costs, { sales: pnlSales, estimatedCostUnits: pnlSales.filter((sale) => sale.costEstimated).length, wholesaleLines });
  }

  /**
   * The owner's P&L of a machine whose sales were already summed
   * (`machineSalesDayService`) rather than read one by one: the same costs
   * below gross profit as `forMachine`, from costs read with
   * `costsBelowGrossProfit`. `sales` is empty.
   */
  summedOwnerPnl(input: Omit<PnlInput, 'perspective' | 'costs'>, profile: MachineEconomicProfile, product: ProductEconomics, costs: PnlCostReads, estimatedCostUnits: number): MachinePnl {
    return this.assemble({ ...input, perspective: 'owner' }, profile, product, costs, { sales: [], estimatedCostUnits, wholesaleLines: [] });
  }

  /** The machine's customer sales completed in the period. */
  private async salesOf(input: PnlInput): Promise<{ id: string; data: MachineTransaction }[]> {
    const sales: { id: string; data: MachineTransaction }[] = [];
    for await (const sale of machineTransactionRepository.streamDispensedInRange(input.businessId, { machineId: input.machineId, since: input.periodStart, until: input.periodEnd, fields: PNL_SALE_FIELDS })) {
      if (isCustomerSale(sale.data)) sales.push(sale);
    }
    return sales;
  }

  /** Subscription, advertising and maintenance for the period — read together. */
  async costsBelowGrossProfit(input: PnlInput, profile: MachineEconomicProfile): Promise<PnlCostReads> {
    const [subscriptionKes, advertising, maintenance] = await Promise.all([
      profile.settlesWithOwner ? this.subscriptionSettledInPeriod(input.businessId, input.machineId, input.periodStart, input.periodEnd) : 0,
      input.costs?.adRevenueKes !== undefined ? { grossKes: input.costs.adRevenueKes, uncomputedMonths: [] } : advertisingService.machineAdRevenue(input.businessId, input.machineId, input.periodStart, input.periodEnd),
      maintenanceService.forPnl(input.businessId, input.machineId, input.periodStart, input.periodEnd, profile.partnerId),
    ]);
    return { subscriptionKes, advertising, maintenance };
  }

  private assemble(
    input: PnlInput,
    profile: MachineEconomicProfile,
    product: ProductEconomics,
    costs: PnlCostReads,
    extras: { sales: PnlSale[]; estimatedCostUnits: number; wholesaleLines: { units: number; ownerWholesaleKes: number | null; landedCostKes: number | null }[] },
  ): MachinePnl {
    const { subscriptionKes, advertising, maintenance } = costs;
    const locationCommissionKes = profile.locationCommissionPct === null ? null : shareOf(product.netRevenueKes, profile.locationCommissionPct);
    const adRevenueKes = advertising.grossKes;
    const ownerAdShareKes = profile.settlesWithOwner ? shareOf(adRevenueKes, profile.terms.adRevenueSharePartnerPct) : 0;

    const ownersView = input.perspective === 'owner' || profile.settlesWithOwner;
    const ownerMaintenanceKes = profile.terms.maintenanceResponsibility === 'owner' && maintenance.ownerRecords === 0 ? null : maintenance.ownerKes;
    const result = contribution(product, {
      // The business's M-Pesa tariff isn't recorded yet: reported as missing, never guessed.
      paymentFeesKes: null,
      locationCommissionKes,
      subscriptionKes: ownersView ? subscriptionKes : 0,
      maintenanceKes: ownersView ? ownerMaintenanceKes : maintenance.snackQuestKes,
      adRevenueKes: ownersView ? ownerAdShareKes : adRevenueKes,
    });

    let snackQuestIncome: MachinePnl['snackQuestIncome'] = null;
    if (input.perspective === 'snack_quest' && profile.settlesWithOwner) {
      const wholesale = wholesaleMargin(extras.wholesaleLines);
      const adShareKes = adRevenueKes - ownerAdShareKes;
      snackQuestIncome = {
        wholesaleMarginKes: wholesale.marginKes,
        wholesaleUnpricedUnits: wholesale.unpricedUnits,
        subscriptionKes,
        adShareKes,
        totalKes: wholesale.marginKes + subscriptionKes + adShareKes,
        maintenanceKes: maintenance.snackQuestKes,
        afterMaintenanceKes: wholesale.marginKes + subscriptionKes + adShareKes - maintenance.snackQuestKes,
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
      estimatedCostUnits: extras.estimatedCostUnits,
      snackQuestIncome,
      advertising: ownersView ? { grossKes: ownerAdShareKes, uncomputedMonths: advertising.uncomputedMonths } : advertising,
      sales: extras.sales,
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

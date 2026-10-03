import { marginPct } from '@/lib/finance/economics';
import { MACHINE_COST_CATEGORY_GROUP, type MachineCostCategory } from '@/types/machineDeal';

export type MachineDealMissing = 'landed_cost' | 'installation_cost';

export interface MachineDealSummary {
  landedKes: number;
  installationKes: number;
  totalCostKes: number;
  /** Machine price + installation charged; null when not sold. */
  saleRevenueKes: number | null;
  /** Sale revenue − total cost; null when unsold or when a cost is still unknown. */
  profitKes: number | null;
  marginPct: number | null;
  /** Costs that aren't recorded yet, so the profit can't be stated. Never treated as zero. */
  missing: MachineDealMissing[];
}

/**
 * The money on one machine as an asset (§ MACHINE DEALS): what it took to
 * land and install, what it sold for, and the difference. Voided lines are
 * left out by the caller. A cost nobody has recorded is missing, not zero:
 * no landed cost means no profit figure; installation counts as known when
 * a line is recorded or staff marked the machine as having none.
 */
export function machineDealSummary(input: {
  costs: readonly { category: MachineCostCategory; amountKes: number }[];
  noInstallationCost: boolean;
  sale: { machinePriceKes: number; installationChargeKes: number } | null;
}): MachineDealSummary {
  let landedKes = 0;
  let installationKes = 0;
  for (const line of input.costs) {
    if (MACHINE_COST_CATEGORY_GROUP[line.category] === 'landed') landedKes += line.amountKes;
    else installationKes += line.amountKes;
  }
  const missing: MachineDealMissing[] = [];
  if (landedKes === 0) missing.push('landed_cost');
  if (installationKes === 0 && !input.noInstallationCost) missing.push('installation_cost');
  const totalCostKes = landedKes + installationKes;
  const saleRevenueKes = input.sale ? input.sale.machinePriceKes + input.sale.installationChargeKes : null;
  const profitKes = saleRevenueKes !== null && missing.length === 0 ? saleRevenueKes - totalCostKes : null;
  return {
    landedKes,
    installationKes,
    totalCostKes,
    saleRevenueKes,
    profitKes,
    marginPct: profitKes !== null && saleRevenueKes !== null ? marginPct(profitKes, saleRevenueKes) : null,
    missing,
  };
}

export const MACHINE_DEAL_MISSING_LABEL: Record<MachineDealMissing, string> = {
  landed_cost: 'Landed cost not recorded',
  installation_cost: 'Installation cost not recorded',
};

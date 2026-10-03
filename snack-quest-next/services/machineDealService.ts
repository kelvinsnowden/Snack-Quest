import 'server-only';

import { machineDealRepository } from '@/repositories/machineDealRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineDealSummary, type MachineDealSummary } from '@/lib/finance/machineDeal';
import { nairobiClock } from '@/lib/ads/playlist';
import { MACHINE_COST_CATEGORIES, MAX_MACHINE_COST_KES, type MachineCostCategory, type MachineCostLine, type MachineDeal, type MachineSaleRecord } from '@/types/machineDeal';

export class MachineDealValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MachineDealValidationError';
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new MachineDealValidationError(`${label} must be a date (YYYY-MM-DD).`);
  if (value > nairobiClock(new Date()).date) throw new MachineDealValidationError(`${label} can’t be in the future.`);
  return value;
}

function kes(value: unknown, label: string, { allowZero = false } = {}): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_MACHINE_COST_KES) {
    throw new MachineDealValidationError(`${label} must be a whole number of shillings${allowZero ? '' : ' above zero'}, up to ${MAX_MACHINE_COST_KES.toLocaleString('en-KE')}.`);
  }
  return value;
}

function text(value: unknown, label: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (required) throw new MachineDealValidationError(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new MachineDealValidationError(`${label} must be text.`);
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length > max) throw new MachineDealValidationError(`Keep ${label.toLowerCase()} under ${max} characters.`);
  return clean;
}

export interface MachineDealView {
  machineId: string;
  machineCode: string;
  ownershipType: string | null;
  ownerPartnerId: string | null;
  costs: { id: string; data: MachineCostLine }[];
  deal: MachineDeal | null;
  summary: MachineDealSummary;
}

/**
 * The machine as an asset (§ MACHINE DEALS): what it cost to land and
 * install, and — for a machine sold to an owner — what it sold for and
 * what Snack Quest made. Costs are a ledger (void, never edit); a sale is
 * one record per machine that can be cancelled, never overwritten.
 */
class MachineDealService {
  private async assertMachine(businessId: string, machineId: string) {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineDealValidationError('Machine not found.');
    return machine;
  }

  async recordCost(businessId: string, actor: string, machineId: string, input: Record<string, unknown>): Promise<string> {
    await this.assertMachine(businessId, machineId);
    if (!(MACHINE_COST_CATEGORIES as readonly string[]).includes(input.category as string)) throw new MachineDealValidationError('Choose what this cost was for.');
    return machineDealRepository.createCost({
      businessId,
      machineId,
      category: input.category as MachineCostCategory,
      description: text(input.description, 'Description', 200, true)!,
      amountKes: kes(input.amountKes, 'Amount'),
      occurredOn: date(input.occurredOn, 'Date'),
      recordedBy: actor,
    });
  }

  async voidCost(businessId: string, actor: string, costId: string, reason: unknown): Promise<MachineCostLine> {
    return machineDealRepository.voidCost(businessId, costId, actor, text(reason, 'Reason', 300, true)!);
  }

  async recordSale(businessId: string, actor: string, machineId: string, input: Record<string, unknown>): Promise<MachineSaleRecord> {
    const machine = await this.assertMachine(businessId, machineId);
    let buyerPartnerId: string | null = null;
    if (input.buyerPartnerId !== undefined && input.buyerPartnerId !== null && input.buyerPartnerId !== '') {
      if (typeof input.buyerPartnerId !== 'string' || !(await partnerRepository.findById(businessId, input.buyerPartnerId))) throw new MachineDealValidationError('That owner wasn’t found.');
      buyerPartnerId = input.buyerPartnerId;
    } else {
      buyerPartnerId = machine.ownerPartnerId ?? null;
    }
    return machineDealRepository.recordSale(businessId, machineId, {
      buyerPartnerId,
      soldOn: date(input.soldOn, 'Sale date'),
      machinePriceKes: kes(input.machinePriceKes, 'Machine price'),
      installationChargeKes: input.installationChargeKes === undefined ? 0 : kes(input.installationChargeKes, 'Installation charged', { allowZero: true }),
      note: text(input.note, 'Note', 300, false),
      recordedBy: actor,
    });
  }

  async cancelSale(businessId: string, actor: string, machineId: string, reason: unknown): Promise<MachineSaleRecord> {
    return machineDealRepository.cancelSale(businessId, machineId, actor, text(reason, 'Reason', 300, true)!);
  }

  async setNoInstallationCost(businessId: string, machineId: string, value: unknown): Promise<void> {
    if (typeof value !== 'boolean') throw new MachineDealValidationError('Say whether this machine had no installation cost.');
    await this.assertMachine(businessId, machineId);
    await machineDealRepository.setNoInstallationCost(businessId, machineId, value);
  }

  async forMachine(businessId: string, machineId: string): Promise<MachineDealView> {
    const machine = await this.assertMachine(businessId, machineId);
    const [costs, deal] = await Promise.all([machineDealRepository.listCosts(businessId, machineId), machineDealRepository.getDeal(businessId, machineId)]);
    return {
      machineId,
      machineCode: machine.machineCode,
      ownershipType: machine.ownershipType ?? null,
      ownerPartnerId: machine.ownerPartnerId ?? null,
      costs,
      deal,
      summary: machineDealSummary({ costs: costs.filter(({ data }) => !data.voided).map(({ data }) => data), noInstallationCost: deal?.noInstallationCost ?? false, sale: deal?.sale ?? null }),
    };
  }

  /** Every machine with its costs and sale — the fleet view. Decommissioned machines are included: their costs were real. */
  async forFleet(businessId: string): Promise<(Omit<MachineDealView, 'costs'> & { costCount: number })[]> {
    const [machines, costs, deals] = await Promise.all([machineRepository.listAllForBusiness(businessId), machineDealRepository.listAllLiveCosts(businessId), machineDealRepository.listDeals(businessId)]);
    const costsByMachine = new Map<string, MachineCostLine[]>();
    for (const { data } of costs) costsByMachine.set(data.machineId, [...(costsByMachine.get(data.machineId) ?? []), data]);
    const dealByMachine = new Map(deals.map((deal) => [deal.machineId, deal]));
    return machines
      .map(({ id, data }) => {
        const machineCosts = costsByMachine.get(id) ?? [];
        const deal = dealByMachine.get(id) ?? null;
        return {
          machineId: id,
          machineCode: data.machineCode,
          ownershipType: data.ownershipType ?? null,
          ownerPartnerId: data.ownerPartnerId ?? null,
          costCount: machineCosts.length,
          deal,
          summary: machineDealSummary({ costs: machineCosts, noInstallationCost: deal?.noInstallationCost ?? false, sale: deal?.sale ?? null }),
        };
      })
      .sort((a, b) => a.machineCode.localeCompare(b.machineCode));
  }
}

export const machineDealService = new MachineDealService();

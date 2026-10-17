import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineService } from '@/services/machineService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { MachineAssortmentNotFoundError } from '@/repositories/machineAssortmentRepository';
import type { PermissionKey } from '@/lib/auth/permissions';
import type { MachineAssortment, MachineStatus } from '@/types';

/**
 * One change applied to many machines (§ F6 bulk operations). Each
 * machine goes through the same service call its own page uses, so
 * every rule still holds — a status move a machine isn't allowed to make
 * is refused for that machine and the rest carry on. The result lists
 * every machine with what happened, nothing is silently skipped.
 */
export type BulkAction =
  | { kind: 'status'; to: MachineStatus }
  | { kind: 'price'; productCatalogue: MachineAssortment['productCatalogue']; productId: string; priceKes: number | null }
  | { kind: 'add_product'; productCatalogue: MachineAssortment['productCatalogue']; productId: string }
  | { kind: 'remove_product'; productCatalogue: MachineAssortment['productCatalogue']; productId: string }
  | { kind: 'copy_range'; fromMachineId: string; includePriceOverrides: boolean };

export interface BulkResult {
  machineId: string;
  machineCode: string;
  outcome: 'done' | 'skipped' | 'failed';
  detail: string;
}

export const MAX_BULK_MACHINES = 200;
const STATUSES: MachineStatus[] = ['provisioning', 'installing', 'testing', 'active', 'maintenance', 'offline', 'decommissioned'];
const CATALOGUES = ['package', 'snackItem'] as const;

export class BulkActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkActionError';
  }
}

/** Checks a request body. Throws `BulkActionError` with the reason. */
export function parseBulkRequest(body: unknown): { action: BulkAction; machineIds: string[] } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(raw.machineIds) ? [...new Set(raw.machineIds.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
  if (ids.length === 0) throw new BulkActionError('Choose at least one machine.');
  if (ids.length > MAX_BULK_MACHINES) throw new BulkActionError(`At most ${MAX_BULK_MACHINES} machines at a time.`);
  const a = (raw.action ?? {}) as Record<string, unknown>;
  const product = () => {
    if (!CATALOGUES.includes(a.productCatalogue as (typeof CATALOGUES)[number]) || typeof a.productId !== 'string' || !a.productId) throw new BulkActionError('Choose a product.');
    return { productCatalogue: a.productCatalogue as MachineAssortment['productCatalogue'], productId: a.productId };
  };
  switch (a.kind) {
    case 'status':
      if (!STATUSES.includes(a.to as MachineStatus)) throw new BulkActionError('Choose a status.');
      return { machineIds: ids, action: { kind: 'status', to: a.to as MachineStatus } };
    case 'price': {
      const priceKes = a.priceKes === null ? null : Number(a.priceKes);
      if (priceKes !== null && (!Number.isInteger(priceKes) || priceKes <= 0 || priceKes > 100_000)) throw new BulkActionError('Enter a price in whole shillings, or clear it to use the normal price.');
      return { machineIds: ids, action: { kind: 'price', ...product(), priceKes } };
    }
    case 'add_product':
      return { machineIds: ids, action: { kind: 'add_product', ...product() } };
    case 'remove_product':
      return { machineIds: ids, action: { kind: 'remove_product', ...product() } };
    case 'copy_range':
      if (typeof a.fromMachineId !== 'string' || !a.fromMachineId) throw new BulkActionError('Choose the machine to copy from.');
      return { machineIds: ids, action: { kind: 'copy_range', fromMachineId: a.fromMachineId, includePriceOverrides: a.includePriceOverrides === true } };
    default:
      throw new BulkActionError('Choose what to change.');
  }
}

/** The permissions a bulk action needs — the same ones the single-machine change needs. */
export function permissionsFor(action: BulkAction): PermissionKey[] {
  switch (action.kind) {
    case 'status':
      return action.to === 'decommissioned' ? ['machines.status.manage', 'machines.decommission'] : ['machines.status.manage'];
    case 'price':
      return ['pricing.manage'];
    case 'add_product':
    case 'remove_product':
      return ['machine_catalog.manage'];
    case 'copy_range':
      return action.includePriceOverrides ? ['machine_catalog.manage', 'pricing.manage'] : ['machine_catalog.manage'];
  }
}

class MachineBulkService {
  async run(businessId: string, machineIds: string[], action: BulkAction, actor: string): Promise<BulkResult[]> {
    const results: BulkResult[] = [];
    for (const machineId of machineIds) {
      const machine = await machineRepository.findById(businessId, machineId);
      if (!machine) {
        results.push({ machineId, machineCode: machineId, outcome: 'failed', detail: 'Machine not found.' });
        continue;
      }
      const result = (outcome: BulkResult['outcome'], detail: string) => results.push({ machineId, machineCode: machine.machineCode, outcome, detail });
      try {
        switch (action.kind) {
          case 'status':
            if (machine.status === action.to) result('skipped', `Already ${action.to}.`);
            else {
              await machineService.updateStatus(businessId, machineId, action.to, actor);
              result('done', `${machine.status} → ${action.to}`);
            }
            break;
          case 'price':
            await machineAssortmentService.setPriceOverride(businessId, machineId, action.productCatalogue, action.productId, action.priceKes, actor);
            result('done', action.priceKes === null ? 'Back to the normal price.' : `KES ${action.priceKes}`);
            break;
          case 'add_product':
            await machineAssortmentService.assortProduct({ businessId, machineId, productCatalogue: action.productCatalogue, productId: action.productId, actor });
            result('done', 'Added to its catalogue.');
            break;
          case 'remove_product':
            await machineAssortmentService.unassortProduct(businessId, machineId, action.productCatalogue, action.productId);
            result('done', 'Removed from its catalogue.');
            break;
          case 'copy_range':
            if (machineId === action.fromMachineId) result('skipped', 'This is the machine being copied from.');
            else {
              const copied = await machineAssortmentService.copyRange(businessId, action.fromMachineId, machineId, { includePriceOverrides: action.includePriceOverrides, actor });
              result('done', `${copied.added} added, ${copied.alreadyCarried} already carried.`);
            }
            break;
        }
      } catch (error) {
        if (error instanceof MachineAssortmentNotFoundError) result('skipped', 'Doesn’t carry this product.');
        else result('failed', error instanceof Error ? error.message : String(error));
      }
    }
    return results;
  }
}

export const machineBulkService = new MachineBulkService();

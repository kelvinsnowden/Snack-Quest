import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { maintenanceRepository, MaintenanceNotFoundError, MaintenanceStateError } from '@/repositories/maintenanceRepository';
import { machineService } from '@/services/machineService';
import { nairobiClock } from '@/lib/ads/playlist';
import {
  MAINTENANCE_COST_CATEGORIES,
  MAINTENANCE_PAYERS,
  MAINTENANCE_REQUEST_CATEGORIES,
  MAINTENANCE_REQUEST_STATUSES,
  MAINTENANCE_URGENCIES,
  MAX_MAINTENANCE_COST_KES,
  type MaintenanceCost,
  type MaintenanceRequest,
  type MaintenanceRequestStatus,
} from '@/types/maintenance';

export { MaintenanceNotFoundError, MaintenanceStateError };

export class MaintenanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaintenanceValidationError';
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new MaintenanceValidationError(`${field} must be one of: ${allowed.join(', ')}`);
}

function text(value: unknown, field: string, { min = 1, max = 1000, optional = false } = {}): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (optional) return null;
    throw new MaintenanceValidationError(`${field} is required`);
  }
  if (typeof value !== 'string') throw new MaintenanceValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new MaintenanceValidationError(`${field} needs at least ${min} characters`);
  if (trimmed.length > max) throw new MaintenanceValidationError(`${field} can be at most ${max} characters`);
  return trimmed;
}

function realDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new MaintenanceValidationError(`${field} must be a date like 2026-10-03`);
  }
  return value;
}

/** Totals of non-voided costs for one machine and period, split by who bore them. */
export interface MaintenanceForPnl {
  snackQuestKes: number;
  /** Costs the given owner bore. */
  ownerKes: number;
  /** How many owner-borne costs were recorded: none means the owner's own spend is unknown, not zero. */
  ownerRecords: number;
}

/**
 * Machine maintenance (§ MAINTENANCE): requests raised by owners or staff,
 * and the cost ledger. An owner reaches only their own machines' requests,
 * and of the costs only those they bore. Costs are voided, never edited.
 */
class MaintenanceService {
  /** An owner reports a problem on a machine they own. */
  async raiseByOwner(businessId: string, partnerId: string, machineId: string, uid: string, body: Record<string, unknown>): Promise<string> {
    await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    return maintenanceRepository.createRequest(
      {
        businessId,
        machineId,
        partnerId,
        raisedBy: { kind: 'owner', uid },
        category: oneOf(body.category, MAINTENANCE_REQUEST_CATEGORIES, 'category'),
        urgency: body.urgency === undefined ? 'normal' : oneOf(body.urgency, MAINTENANCE_URGENCIES, 'urgency'),
        description: text(body.description, 'description', { min: 5 }) as string,
      },
      null,
    );
  }

  /** Staff log a problem on any machine of the business. */
  async raiseByStaff(businessId: string, machineId: string, uid: string, body: Record<string, unknown>): Promise<string> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);
    return maintenanceRepository.createRequest(
      {
        businessId,
        machineId,
        partnerId: machine.ownerPartnerId ?? null,
        raisedBy: { kind: 'staff', uid },
        category: oneOf(body.category, MAINTENANCE_REQUEST_CATEGORIES, 'category'),
        urgency: body.urgency === undefined ? 'normal' : oneOf(body.urgency, MAINTENANCE_URGENCIES, 'urgency'),
        description: text(body.description, 'description', { min: 5 }) as string,
      },
      null,
    );
  }

  /** Staff move a request on: acknowledge, schedule a visit, resolve or cancel. Resolving or cancelling needs a note of what happened. */
  async updateByStaff(businessId: string, id: string, uid: string, body: Record<string, unknown>): Promise<MaintenanceRequest> {
    const to = oneOf<MaintenanceRequestStatus>(body.status, MAINTENANCE_REQUEST_STATUSES, 'status');
    if (to === 'open') throw new MaintenanceValidationError('A request cannot be put back to reported');
    const note = text(body.note, 'note', { optional: true, max: 1000 });
    const scheduledFor = to === 'scheduled' ? realDate(body.scheduledFor, 'scheduledFor') : undefined;
    const closing = to === 'resolved' || to === 'cancelled';
    const resolution = closing ? (text(body.resolution ?? body.note, 'resolution', { min: 3 }) as string) : undefined;
    return maintenanceRepository.transitionRequest(businessId, id, { to, by: uid, byKind: 'staff', note, scheduledFor, resolution });
  }

  /** An owner withdraws their own request, for example when the problem went away. */
  async cancelByOwner(businessId: string, partnerId: string, id: string, uid: string, body: Record<string, unknown>): Promise<MaintenanceRequest> {
    const reason = text(body.reason, 'reason', { min: 3, max: 500 }) as string;
    return maintenanceRepository.transitionRequest(businessId, id, { to: 'cancelled', by: uid, byKind: 'owner', note: reason, resolution: `Withdrawn by the owner: ${reason}`, expectPartnerId: partnerId });
  }

  async findRequest(businessId: string, id: string): Promise<MaintenanceRequest> {
    const request = await maintenanceRepository.findRequest(businessId, id);
    if (!request) throw new MaintenanceNotFoundError('Request', id);
    return request;
  }

  async listRequests(businessId: string, filters: { status?: string; machineId?: string } = {}) {
    const status = filters.status ? oneOf<MaintenanceRequestStatus>(filters.status, MAINTENANCE_REQUEST_STATUSES, 'status') : undefined;
    return maintenanceRepository.listRequests(businessId, { status, machineId: filters.machineId || undefined });
  }

  countOpenRequests(businessId: string): Promise<number> {
    return maintenanceRepository.countOpenRequests(businessId);
  }

  /**
   * Records a cost. The machine's owner on that day is stamped on it, so a
   * later change of owner never moves an old cost onto the new owner.
   * `paidBy: 'owner'` needs a machine that has an owner; a cost linked to a
   * request must be on that request's machine.
   */
  async recordCost(businessId: string, uid: string, body: Record<string, unknown>, now = new Date()): Promise<string> {
    const machineId = text(body.machineId, 'machineId', { max: 200 }) as string;
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) throw new MachineNotFoundError(machineId);

    const amountKes = body.amountKes;
    if (typeof amountKes !== 'number' || !Number.isInteger(amountKes) || amountKes < 1 || amountKes > MAX_MAINTENANCE_COST_KES) {
      throw new MaintenanceValidationError(`amountKes must be whole shillings from 1 to ${MAX_MAINTENANCE_COST_KES.toLocaleString('en-KE')}`);
    }
    const occurredOn = realDate(body.occurredOn, 'occurredOn');
    if (occurredOn > nairobiClock(now).date) throw new MaintenanceValidationError('occurredOn cannot be in the future');

    const paidBy = oneOf(body.paidBy, MAINTENANCE_PAYERS, 'paidBy');
    const partnerId = machine.ownerPartnerId ?? null;
    if (paidBy === 'owner' && !partnerId) throw new MaintenanceValidationError('This machine has no owner, so Snack Quest bore the cost');

    const requestId = text(body.requestId, 'requestId', { optional: true, max: 200 });
    if (requestId) {
      const request = await maintenanceRepository.findRequest(businessId, requestId);
      if (!request) throw new MaintenanceNotFoundError('Request', requestId);
      if (request.machineId !== machineId) throw new MaintenanceValidationError('That request is for a different machine');
    }

    return maintenanceRepository.createCost({
      businessId,
      machineId,
      partnerId,
      requestId,
      occurredOn,
      category: oneOf(body.category, MAINTENANCE_COST_CATEGORIES, 'category'),
      description: text(body.description, 'description', { min: 3, max: 500 }) as string,
      amountKes,
      paidBy,
      vendor: text(body.vendor, 'vendor', { optional: true, max: 200 }),
      createdBy: uid,
    });
  }

  async voidCost(businessId: string, id: string, uid: string, body: Record<string, unknown>): Promise<void> {
    const reason = text(body.reason, 'reason', { min: 3, max: 500 }) as string;
    await maintenanceRepository.voidCost(businessId, id, uid, reason);
  }

  async findCost(businessId: string, id: string): Promise<MaintenanceCost> {
    const cost = await maintenanceRepository.findCost(businessId, id);
    if (!cost) throw new MaintenanceNotFoundError('Cost', id);
    return cost;
  }

  listCostsForMachine(businessId: string, machineId: string, range: { fromDate?: string; toDate?: string } = {}) {
    return maintenanceRepository.listCostsForMachine(businessId, machineId, range);
  }

  listRecentCosts(businessId: string, limit?: number) {
    return maintenanceRepository.listRecentCosts(businessId, limit);
  }

  /** An owner's view of one machine: their requests, and the costs they bore. Snack Quest's own spend is not shown to them. */
  async forOwnerMachine(businessId: string, partnerId: string, machineId: string) {
    await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);
    const [requests, costs] = await Promise.all([
      maintenanceRepository.listRequests(businessId, { machineId, partnerId, limit: 50 }),
      maintenanceRepository.listCostsForMachine(businessId, machineId, {}, 200),
    ]);
    return {
      requests,
      costs: costs.filter(({ data }) => data.paidBy === 'owner' && data.partnerId === partnerId && !data.voided),
    };
  }

  /**
   * Non-voided costs on a machine with `occurredOn` inside the period, in
   * Nairobi dates. `periodEnd` is treated as exclusive; its last
   * millisecond's date is the last day counted.
   */
  async forPnl(businessId: string, machineId: string, periodStart: Date, periodEnd: Date, partnerId: string | null): Promise<MaintenanceForPnl> {
    const fromDate = nairobiClock(periodStart).date;
    const toDate = nairobiClock(new Date(periodEnd.getTime() - 1)).date;
    const rows = await maintenanceRepository.listCostsForMachine(businessId, machineId, { fromDate, toDate }, 2000);
    let snackQuestKes = 0;
    let ownerKes = 0;
    let ownerRecords = 0;
    for (const { data } of rows) {
      if (data.voided) continue;
      if (data.paidBy === 'snack_quest') snackQuestKes += data.amountKes;
      else if (partnerId !== null && data.partnerId === partnerId) {
        ownerKes += data.amountKes;
        ownerRecords += 1;
      }
    }
    return { snackQuestKes, ownerKes, ownerRecords };
  }
}

export const maintenanceService = new MaintenanceService();

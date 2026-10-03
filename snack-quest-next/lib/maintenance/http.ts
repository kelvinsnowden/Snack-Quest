import 'server-only';

import { MachineNotFoundError } from '@/repositories/machineRepository';
import { PartnerDoesNotOwnMachineError } from '@/services/machineService';
import { MaintenanceNotFoundError, MaintenanceStateError, MaintenanceValidationError } from '@/services/maintenanceService';
import { iso } from '@/lib/ads/routeHelpers';
import type { MaintenanceCost, MaintenanceRequest } from '@/types/maintenance';

/** Maps maintenance's expected failures to responses; anything else is a real error. A machine an owner doesn't own reads as not found. */
export function maintenanceErrorResponse(error: unknown): Response {
  if (error instanceof MaintenanceValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof MaintenanceStateError) return Response.json({ error: error.message }, { status: 409 });
  // One answer for missing and not-yours, never echoing the id: no existence oracle.
  if (error instanceof MaintenanceNotFoundError || error instanceof MachineNotFoundError || error instanceof PartnerDoesNotOwnMachineError) return Response.json({ error: 'not found' }, { status: 404 });
  throw error;
}

export function serializeRequest(id: string, data: MaintenanceRequest) {
  return {
    id,
    machineId: data.machineId,
    partnerId: data.partnerId,
    raisedBy: data.raisedBy,
    category: data.category,
    urgency: data.urgency,
    description: data.description,
    status: data.status,
    scheduledFor: data.scheduledFor,
    resolution: data.resolution,
    updates: data.updates.map((update) => ({ ...update, at: iso(update.at) })),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    closedAt: iso(data.closedAt),
  };
}

/** What an owner sees of a request: no staff uids. */
export function serializeRequestForOwner(id: string, data: MaintenanceRequest) {
  const full = serializeRequest(id, data);
  return {
    ...full,
    raisedBy: { kind: data.raisedBy.kind },
    updates: full.updates.map(({ at, byKind, status, note }) => ({ at, byKind, status, note })),
  };
}

export function serializeCost(id: string, data: MaintenanceCost) {
  return {
    id,
    machineId: data.machineId,
    partnerId: data.partnerId,
    requestId: data.requestId,
    occurredOn: data.occurredOn,
    category: data.category,
    description: data.description,
    amountKes: data.amountKes,
    paidBy: data.paidBy,
    vendor: data.vendor,
    createdBy: data.createdBy,
    createdAt: iso(data.createdAt),
    voided: data.voided ? { at: iso(data.voided.at), by: data.voided.by, reason: data.voided.reason } : null,
  };
}

/** What an owner sees of a cost they bore: no staff uid. */
export function serializeCostForOwner(id: string, data: MaintenanceCost) {
  return { id, machineId: data.machineId, requestId: data.requestId, occurredOn: data.occurredOn, category: data.category, description: data.description, amountKes: data.amountKes, vendor: data.vendor };
}

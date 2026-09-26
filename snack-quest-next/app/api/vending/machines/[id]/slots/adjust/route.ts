import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import {
  machineInventoryMovementService,
  SlotNotFoundError,
  DiscrepancyReasonRequiredError,
} from '@/services/machineInventoryMovementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * § STOCK DISCREPANCY — a physical count against a slot's expected
 * (cached) quantity. Required `reason`; writes a real
 * `manual_adjustment` ledger entry through
 * `machineInventoryMovementService.recordDiscrepancyAdjustment`
 * either way, never silently correcting or discarding a count that
 * happens to match.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { slotCode, physicalCountQuantity, reason } = (body ?? {}) as Record<string, unknown>;
  if (typeof slotCode !== 'string' || !slotCode) {
    return Response.json({ error: 'slotCode is required' }, { status: 400 });
  }
  if (typeof physicalCountQuantity !== 'number' || !Number.isFinite(physicalCountQuantity) || physicalCountQuantity < 0) {
    return Response.json({ error: 'physicalCountQuantity must be a non-negative number' }, { status: 400 });
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return Response.json({ error: 'reason is required' }, { status: 400 });
  }

  try {
    const result = await machineInventoryMovementService.recordDiscrepancyAdjustment({
      businessId: session.businessId,
      machineId: id,
      slotId: slotCode,
      physicalCountQuantity,
      reason,
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'record_stock_discrepancy',
      entityType: 'machineInventoryMovement',
      entityId: `${id}__${slotCode}`,
      before: { expectedQuantity: result.expectedQuantity },
      after: { physicalCountQuantity: result.physicalCountQuantity, discrepancy: result.discrepancy, reason },
      machineId: id,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SlotNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DiscrepancyReasonRequiredError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

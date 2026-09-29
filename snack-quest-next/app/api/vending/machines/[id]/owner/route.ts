import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import {
  machineService,
  OwnerReassignmentError,
} from '@/services/machineService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Give a machine to another owner, or back to Snack Quest with
 * `partnerId: null` (`owners.manage`). Refused while an agreement is
 * still active. The new owner's portal starts from the handover — they
 * never see the previous owner's sales — and settlements can't span it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage'))
    return forbiddenForPermission('owners.manage');
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (
    body.partnerId !== null &&
    (typeof body.partnerId !== 'string' || !body.partnerId)
  )
    return Response.json(
      { error: 'partnerId must be an owner id or null' },
      { status: 400 },
    );
  if (
    body.reason !== undefined &&
    body.reason !== null &&
    typeof body.reason !== 'string'
  )
    return Response.json({ error: 'reason must be a string' }, { status: 400 });
  const reason =
    typeof body.reason === 'string'
      ? body.reason.trim().slice(0, 500) || null
      : null;

  try {
    const before = await machineService.findById(session.businessId, id);
    if (!before)
      return Response.json(
        { error: `Machine ${id} not found` },
        { status: 404 },
      );
    await machineService.reassignOwner(
      session.businessId,
      id,
      body.partnerId as string | null,
      session.uid,
      reason,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'reassign_machine_owner',
      entityType: 'machine',
      entityId: id,
      before: { ownerPartnerId: before.ownerPartnerId ?? null },
      after: { ownerPartnerId: body.partnerId, reason },
      machineId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineNotFoundError)
      return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof OwnerReassignmentError)
      return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

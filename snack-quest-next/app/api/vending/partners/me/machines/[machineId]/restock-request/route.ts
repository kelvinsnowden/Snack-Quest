import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, NothingToRestockError } from '@/services/ownerPortalService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * POST — § QUICK ACTIONS "Request Restock". Opens a real draft
 * restock task for this machine's own low/out-of-stock slots — the
 * same staged workflow every other restock task goes through
 * (`docs/INVENTORY_ARCHITECTURE.md` §5); nothing about this route
 * skips approve/pick/dispatch/receive.
 */
export async function POST(request: Request, { params }: { params: Promise<{ machineId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { machineId } = await params;
  try {
    const taskId = await ownerPortalService.requestRestock(session.businessId, session.partnerId, machineId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'request_restock',
      entityType: 'restockTask',
      entityId: taskId,
      after: { machineId },
      machineId,
      source: 'owner_portal',
    });
    return Response.json({ taskId }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NothingToRestockError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

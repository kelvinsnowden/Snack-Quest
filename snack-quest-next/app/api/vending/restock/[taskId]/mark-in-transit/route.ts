import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { restockTaskService, RestockTaskNotFoundError, IllegalRestockTaskTransitionError } from '@/services/restockTaskService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** `dispatched → in_transit`. */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { taskId } = await params;

  try {
    const before = await restockTaskRepository.findById(session.businessId, taskId);
    await restockTaskService.markInTransit(session.businessId, taskId, session.uid);
    const after = await restockTaskRepository.findById(session.businessId, taskId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'mark_restock_task_in_transit',
      entityType: 'restockTask',
      entityId: taskId,
      before: before ? { status: before.status } : null,
      after: after ? { status: after.status } : null,
      machineId: after?.machineId ?? before?.machineId ?? null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RestockTaskNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalRestockTaskTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

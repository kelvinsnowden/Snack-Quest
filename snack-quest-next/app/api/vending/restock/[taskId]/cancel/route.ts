import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { restockTaskService, RestockTaskNotFoundError, IllegalRestockTaskTransitionError } from '@/services/restockTaskService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Only offered while nothing has physically left a warehouse yet — `draft`/`approved`/`picking`/`dispatched`. Once `in_transit`, `receive()` is the only honest next step. */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'restock.plan')) {
    return forbiddenForPermission('restock.plan');
  }

  const { taskId } = await params;

  try {
    const before = await restockTaskRepository.findById(session.businessId, taskId);
    await restockTaskService.cancel(session.businessId, taskId, session.uid);
    const after = await restockTaskRepository.findById(session.businessId, taskId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'cancel_restock_task',
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

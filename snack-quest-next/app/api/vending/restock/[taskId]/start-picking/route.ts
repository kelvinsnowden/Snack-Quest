import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { restockTaskService, RestockTaskNotFoundError, IllegalRestockTaskTransitionError } from '@/services/restockTaskService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** `approved → picking`. Records the caller as `pickedBy`/`pickedAt`. */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'restock.execute')) {
    return forbiddenForPermission('restock.execute');
  }

  const { taskId } = await params;

  try {
    const before = await restockTaskRepository.findById(session.businessId, taskId);
    await restockTaskService.startPicking(session.businessId, taskId, session.uid);
    const after = await restockTaskRepository.findById(session.businessId, taskId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'start_picking_restock_task',
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

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { restockTaskService, RestockTaskNotFoundError, IllegalRestockTaskTransitionError } from '@/services/restockTaskService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** `draft → approved`. `warehouseId` is optional — assignable here if it wasn't known when the task was opened. */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { taskId } = await params;

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { warehouseId } = (body ?? {}) as Record<string, unknown>;
  if (warehouseId !== undefined && typeof warehouseId !== 'string') {
    return Response.json({ error: 'warehouseId must be a string when provided' }, { status: 400 });
  }

  try {
    const before = await restockTaskRepository.findById(session.businessId, taskId);
    await restockTaskService.approve(session.businessId, taskId, session.uid, warehouseId as string | undefined);
    const after = await restockTaskRepository.findById(session.businessId, taskId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'approve_restock_task',
      entityType: 'restockTask',
      entityId: taskId,
      before: before ? { status: before.status } : null,
      after: after ? { status: after.status, warehouseId: after.warehouseId } : null,
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

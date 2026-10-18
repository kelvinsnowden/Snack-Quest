import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/**
 * `POST` `{ kind: 'maintenance' | 'restock', refId, assigneeUid | null }` — gives a task to a technician, or takes it back.
 * Maintenance visits need `maintenance.manage`; restocks need `restock.plan`.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const kind = body.kind === 'maintenance' || body.kind === 'restock' ? body.kind : null;
  if (!kind || typeof body.refId !== 'string' || !body.refId) return Response.json({ error: 'kind and refId are required' }, { status: 400 });
  if (kind === 'maintenance' && !hasPermission(session, 'maintenance.manage')) return forbiddenForPermission('maintenance.manage');
  if (kind === 'restock' && !hasPermission(session, 'restock.plan')) return forbiddenForPermission('restock.plan');
  const assigneeUid = typeof body.assigneeUid === 'string' && body.assigneeUid ? body.assigneeUid : null;
  try {
    await technicianJobService.assign(session.businessId, { kind, refId: body.refId, assigneeUid }, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'technician_job.assign', entityType: 'technicianJob', entityId: `${kind}_${body.refId}`, after: { assigneeUid } });
    return Response.json({ ok: true });
  } catch (error) {
    return technicianErrorResponse(error);
  }
}

import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { ASSIGN_PERMISSION, requirePermission, staffSession, technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/** `POST` `{ kind: 'maintenance' | 'restock', refId, assigneeUid | null }` — gives a task to a technician, or takes it back. */
export async function POST(request: Request): Promise<Response> {
  const session = await staffSession(request);
  if (session instanceof Response) return session;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const kind = body.kind === 'maintenance' || body.kind === 'restock' ? body.kind : null;
  if (!kind || typeof body.refId !== 'string' || !body.refId) return Response.json({ error: 'kind and refId are required' }, { status: 400 });
  const denied = requirePermission(session, ASSIGN_PERMISSION[kind]);
  if (denied) return denied;
  const assigneeUid = typeof body.assigneeUid === 'string' && body.assigneeUid ? body.assigneeUid : null;
  try {
    await technicianJobService.assign(session.businessId, { kind, refId: body.refId, assigneeUid }, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'technician_job.assign', entityType: 'technicianJob', entityId: `${kind}_${body.refId}`, after: { assigneeUid } });
    return Response.json({ ok: true });
  } catch (error) {
    return technicianErrorResponse(error);
  }
}

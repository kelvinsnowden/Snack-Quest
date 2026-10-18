import { hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { ASSIGN_PERMISSION, WORK_PERMISSION, requirePermission, staffSession, technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/** `POST` `{ note, fixed? }` — finishes the visit; `fixed` also resolves a maintenance request with the note. */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const session = await staffSession(request);
  if (session instanceof Response) return session;
  const { jobId } = await params;
  const job = await technicianJobService.find(session.businessId, jobId);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  const denied = requirePermission(session, WORK_PERMISSION[job.kind]);
  if (denied) return denied;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    await technicianJobService.complete(session.businessId, jobId, { note: typeof body.note === 'string' ? body.note : '', fixed: body.fixed === true }, session.uid, hasPermission(session, ASSIGN_PERMISSION[job.kind]));
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'technician_job.complete', entityType: 'technicianJob', entityId: jobId, machineId: job.machineId, after: { fixed: body.fixed === true } });
    return Response.json({ ok: true });
  } catch (error) {
    return technicianErrorResponse(error);
  }
}

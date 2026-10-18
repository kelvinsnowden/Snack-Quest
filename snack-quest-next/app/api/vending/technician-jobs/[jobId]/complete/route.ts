import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/** `POST` `{ note, fixed? }` — finishes the visit; `fixed` also resolves a maintenance request with the note. Same permissions as ticking. */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { jobId } = await params;
  const job = await technicianJobService.find(session.businessId, jobId);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  if (job.kind === 'maintenance' && !hasPermission(session, 'maintenance.manage')) return forbiddenForPermission('maintenance.manage');
  if (job.kind === 'restock' && !hasPermission(session, 'restock.execute')) return forbiddenForPermission('restock.execute');
  const canManage = job.kind === 'maintenance' ? hasPermission(session, 'maintenance.manage') : hasPermission(session, 'restock.plan');
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    await technicianJobService.complete(session.businessId, jobId, { note: typeof body.note === 'string' ? body.note : '', fixed: body.fixed === true }, session.uid, canManage);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'technician_job.complete', entityType: 'technicianJob', entityId: jobId, machineId: job.machineId, after: { fixed: body.fixed === true } });
    return Response.json({ ok: true });
  } catch (error) {
    return technicianErrorResponse(error);
  }
}

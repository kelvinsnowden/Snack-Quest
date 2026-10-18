import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/**
 * `POST` `{ index, done }` — ticks one item on the on-site checklist.
 * Doing a maintenance job needs `maintenance.manage`, a restock job `restock.execute`;
 * the person it's assigned to ticks it, or someone who can assign that kind of job.
 */
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
    await technicianJobService.tick(session.businessId, jobId, Number(body.index), body.done === true, session.uid, canManage);
    return Response.json({ ok: true });
  } catch (error) {
    return technicianErrorResponse(error);
  }
}

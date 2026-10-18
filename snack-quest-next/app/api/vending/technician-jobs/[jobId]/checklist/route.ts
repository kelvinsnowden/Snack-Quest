import { hasPermission } from '@/lib/auth/permissions';
import { ASSIGN_PERMISSION, WORK_PERMISSION, requirePermission, staffSession, technicianErrorResponse } from '@/lib/vending/technicianJobHttp';
import { technicianJobService } from '@/services/technicianJobService';

/** `POST` `{ index, done }` — ticks one item on the on-site checklist. */
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
    await technicianJobService.tick(session.businessId, jobId, Number(body.index), body.done === true, session.uid, hasPermission(session, ASSIGN_PERMISSION[job.kind]));
    return Response.json({ ok: true });
  } catch (error) {
    return technicianErrorResponse(error);
  }
}

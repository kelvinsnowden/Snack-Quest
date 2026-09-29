import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { scheduledJobService, SCHEDULED_JOBS, type ScheduledJobName } from '@/services/scheduledJobService';
import { loadJobBody } from '@/services/jobs/registry';

/**
 * "Run now" for a scheduled job, from Operations. The same work as the
 * cron, under the same lease: if the job is already running (its cron,
 * or someone else pressing the button) this run is skipped and the
 * caller gets 409. Every job is idempotent, so running one early is safe;
 * each run is recorded like a scheduled one and audited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ jobName: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'ops.jobs.run')) {
    return forbiddenForPermission('ops.jobs.run');
  }

  const { jobName } = await params;
  if (!Object.hasOwn(SCHEDULED_JOBS, jobName)) {
    return Response.json({ error: 'No scheduled job has that name.' }, { status: 404 });
  }
  const name = jobName as ScheduledJobName;
  const body = await loadJobBody(name);
  const outcome = await scheduledJobService.run(session.businessId, name, (job) => body(session.businessId, job, session.uid));
  if (outcome.status === 'skipped') {
    return Response.json({ error: 'This job is already running. Try again when it finishes.' }, { status: 409 });
  }
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'run_scheduled_job',
    entityType: 'scheduledJob',
    entityId: name,
    after: { runId: outcome.runId, status: outcome.status, errors: outcome.errors.length },
  });
  return Response.json({ status: outcome.status, runId: outcome.runId, durationMs: outcome.durationMs, summary: outcome.summary, errors: outcome.errors }, { status: outcome.status === 'failed' ? 500 : 200 });
}

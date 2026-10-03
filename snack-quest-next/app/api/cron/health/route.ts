import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';

/**
 * Scheduled-job health for an external uptime monitor: 200 when every
 * job that has ever run is healthy, 503 when any is failing, abandoned
 * or overdue. This is the watchdog for the case the in-app alert can't
 * cover — every scheduler stopped, so nothing evaluates alerts. Needs
 * the CRON_SECRET; returns job names, states and times only.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const jobs = await scheduledJobService.health(getCurrentBusinessId());
  const unhealthy = jobs.filter((job) => job.state === 'failing' || job.state === 'overdue' || job.state === 'abandoned');
  return Response.json(
    {
      ok: unhealthy.length === 0,
      jobs: jobs.map(({ jobName, state, lastRunAt, lastSuccessAt, lastStatus, expectedEveryMs }) => ({ jobName, state, lastStatus, lastRunAt, lastSuccessAt, expectedEveryMs })),
    },
    { status: unhealthy.length === 0 ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

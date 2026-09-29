import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { scheduledJobService } from '@/services/scheduledJobService';
import { rebuildVendingRollupRange } from '@/services/jobs/rebuildVendingRollups';
import { dateKey } from '@/lib/analytics/dateKey';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 92;
const DAY_MS = 24 * 60 * 60 * 1000;

const isRealDay = (value: unknown): value is string => typeof value === 'string' && DAY_KEY.test(value) && dateKey(new Date(`${value}T00:00:00.000Z`)) === value;

/**
 * Rebuild machine, owner and network daily analytics for chosen days —
 * after correcting a sale, a price or an owner change that happened
 * before the nightly job's three-day window. Days are the analytics day
 * (UTC), inclusive; today is never rebuilt because it isn't finished.
 * Runs as the nightly rollup job, so it can't overlap it (409 if one is
 * running), and at most 92 days at a time.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'ops.jobs.run')) {
    return forbiddenForPermission('ops.jobs.run');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { startDate, endDate } = (body ?? {}) as Record<string, unknown>;
  if (!isRealDay(startDate) || !isRealDay(endDate)) {
    return Response.json({ error: 'startDate and endDate must be days written YYYY-MM-DD.' }, { status: 400 });
  }
  if (startDate > endDate) {
    return Response.json({ error: 'The first day must not be after the last day.' }, { status: 400 });
  }
  const today = dateKey(new Date());
  if (startDate >= today) {
    return Response.json({ error: 'Only finished days can be rebuilt; today is still being counted.' }, { status: 400 });
  }
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
  if (days > MAX_DAYS) {
    return Response.json({ error: `At most ${MAX_DAYS} days at a time.` }, { status: 400 });
  }

  const outcome = await scheduledJobService.run(session.businessId, 'rebuild-vending-rollups', (job) => rebuildVendingRollupRange(session.businessId, job, { startDate, endDate }));
  if (outcome.status === 'skipped') {
    return Response.json({ error: 'Analytics are already being rebuilt. Try again when that finishes.' }, { status: 409 });
  }
  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'rebuild_vending_analytics',
    entityType: 'scheduledJob',
    entityId: 'rebuild-vending-rollups',
    after: { startDate, endDate, runId: outcome.runId, status: outcome.status },
  });
  return Response.json({ status: outcome.status, summary: outcome.summary, errors: outcome.errors }, { status: outcome.status === 'failed' ? 500 : 200 });
}

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { alertService } from '@/services/alertService';

/**
 * "Check now" in the Alert Center (`alerts.view`): runs the alert sweep
 * straight away unless one ran in the last minute. The sweep reads the
 * whole fleet, so that minute stops a room of people clicking from
 * running it once each.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'alerts.view')) return forbiddenForPermission('alerts.view');
  const ran = await alertService.evaluateIfStale(session.businessId);
  const lastEvaluatedAt = await alertService.lastEvaluatedAt(session.businessId);
  return Response.json({ ran, lastEvaluatedAt: lastEvaluatedAt ? lastEvaluatedAt.toISOString() : null });
}

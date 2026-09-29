import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { rebuildAnalyticsRollups } from '@/services/jobs/rebuildAnalyticsRollups';

/**
 * Keeps `trafficDaily` and `customerLifetime` current without the
 * page load waiting on it (§ analytics rollups,
 * docs/FLEET_ARCHITECTURE_AUDIT.md finding 4).
 *
 * Neither rollup strictly needs this to be correct: `getTraffic` heals
 * a missing day on read (`readTrafficWindow` calls
 * `rebuildTrafficDay` itself when a completed day has no stored
 * rollup), and `getCac`/`getCacByChannel`/`getLtv` rebuild the whole
 * customer-lifetime rollup before every read. What this buys is
 * moving that cost off the request that happens to be unlucky enough
 * to hit a cold cache — the difference this session measured was
 * 6.4s against a warmed cache's 0.3s for a 30-day traffic window. One
 * admin page load a day should not be the one that pays for the other
 * twenty-nine.
 *
 * Traffic is rebuilt for the last three days, not just yesterday: a
 * page view can arrive from a slightly stale client clock, and
 * rebuilding is idempotent, so re-covering a day this job already did
 * correctly costs a cheap read and changes nothing. Three days is
 * enough margin for that without turning this into a full 30-day scan
 * every night.
 *
 * Customer lifetime is rebuilt in full, same reasoning documented on
 * `BusinessAnalyticsService.ensureCustomerLifetime` — a refund or
 * cancellation can change a customer's history at any age, so there is
 * no "this slice is finished" boundary the way a completed calendar
 * day has one.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'rebuild-analytics-rollups', (job) => rebuildAnalyticsRollups(businessId, job));
  return scheduledJobService.toResponse(outcome);
}

import 'server-only';

import { analyticsRollupService } from '@/services/analyticsRollupService';
import { dateKey } from '@/lib/analytics/dateKey';
import type { JobContext } from '@/services/scheduledJobService';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Traffic for the last three days and customer lifetime in full. See the cron route for why. */
export async function rebuildAnalyticsRollups(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  const startDate = dateKey(new Date(Date.now() - 3 * DAY_MS));
  const endDate = dateKey(new Date());
  const traffic = await job.step('traffic rollups', () => analyticsRollupService.rebuildTrafficRange(businessId, startDate, endDate));
  const lifetime = await job.step('customer lifetime', () => analyticsRollupService.rebuildCustomerLifetime(businessId));
  return { traffic, lifetime };
}

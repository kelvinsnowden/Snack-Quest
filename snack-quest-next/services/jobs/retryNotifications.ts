import 'server-only';

import { notificationService } from '@/services/notificationService';
import type { JobContext } from '@/services/scheduledJobService';

export async function retryNotifications(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  const result = await job.step('retry sweep', () => notificationService.retrySweep(businessId));
  return { ...(result ?? {}) };
}

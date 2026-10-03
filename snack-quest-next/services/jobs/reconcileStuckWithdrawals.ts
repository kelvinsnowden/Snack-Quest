import 'server-only';

import { withdrawalService } from '@/services/withdrawalService';
import { notificationService } from '@/services/notificationService';
import type { JobContext } from '@/services/scheduledJobService';

/** Queries Daraja about stuck B2C withdrawals; anything still ambiguous pages the admin number. */
export async function reconcileStuckWithdrawals(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  const outcomes = (await job.step('reconcile stuck withdrawals', () => withdrawalService.reconcileStuckWithdrawals(businessId))) ?? [];
  for (const item of outcomes) {
    if (item.outcome === 'needsManualReview' && item.reviewReason) {
      try {
        await notificationService.notifyAdmin(businessId, `URGENT: ${item.reviewReason}`);
      } catch (error) {
        job.itemError('notify admin', error);
      }
    }
  }
  return {
    checked: outcomes.length,
    queried: outcomes.filter((o) => o.outcome === 'queried').length,
    needsManualReview: outcomes.filter((o) => o.outcome === 'needsManualReview').length,
    stillPending: outcomes.filter((o) => o.outcome === 'stillPending').length,
    skipped: outcomes.filter((o) => o.outcome === 'skipped').length,
  };
}

import 'server-only';

import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';
import { notificationService } from '@/services/notificationService';
import type { JobContext } from '@/services/scheduledJobService';

/** Settles payments Safaricom already has a verdict on, then sweeps stuck STK intents. See the cron route. */
export async function reconcileStkPayments(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  // First, settle anything Safaricom already has a verdict on
  // (§ payment auto-recovery). The payment screen does this too, but
  // only while it is open — a customer who approved the prompt and
  // closed the tab has nothing polling for them, and before this
  // their paid order waited on a human noticing the manual-review
  // page. Runs ahead of the sweep below so those never reach it.
  const recovered = (await job.step('recover processing payments', () => paymentService.recoverAllProcessingPayments(businessId))) ?? [];
  for (const result of recovered) {
    try {
      await conversationService.handlePaymentResult(result);
    } catch (error) {
      job.itemError('handle recovered payment', error);
    }
  }

  const outcomes = (await job.step('reconcile stuck intents', () => paymentService.reconcileStuckIntents(businessId))) ?? [];
  for (const item of outcomes) {
    try {
      if (item.outcome === 'confirmedFailed' && item.callbackResult) {
        await conversationService.handlePaymentResult(item.callbackResult);
      } else if (item.outcome === 'needsManualReview' && item.reviewReason) {
        await notificationService.notifyAdmin(businessId, `URGENT: ${item.reviewReason}`);
      }
    } catch (error) {
      job.itemError('handle reconciled intent', error);
    }
  }

  return {
    recovered: recovered.length,
    recoveredSucceeded: recovered.filter((r) => r.status === 'succeeded').length,
    checked: outcomes.length,
    confirmedFailed: outcomes.filter((o) => o.outcome === 'confirmedFailed').length,
    needsManualReview: outcomes.filter((o) => o.outcome === 'needsManualReview').length,
    stillPending: outcomes.filter((o) => o.outcome === 'stillPending').length,
    skipped: outcomes.filter((o) => o.outcome === 'skipped').length,
  };
}

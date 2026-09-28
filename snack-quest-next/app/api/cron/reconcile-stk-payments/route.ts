import { paymentService } from '@/services/paymentService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { conversationService } from '@/services/conversationService';
import { notificationService } from '@/services/notificationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';

/**
 * The STK Push Query fallback sweep's real trigger (§ Daraja
 * Production Integration Verification Audit §2.4/§7,
 * `PaymentService.reconcileStuckIntents`) — same Vercel Cron
 * mechanism, same `CRON_SECRET` bearer-token auth, and same
 * single-current-tenant scoping (`getCurrentBusinessId()`) as
 * `retry-notifications` (see that route's own doc comment for why).
 *
 * Reacts to each outcome exactly the way the real Daraja webhook route
 * reacts to a real callback — `confirmedFailed` outcomes go through
 * the identical `ConversationService.handlePaymentResult` path a real
 * failed callback would, so the customer gets the same "reply PAY to
 * try again" treatment; `needsManualReview` outcomes page the admin
 * WhatsApp number, since real money's resolution is genuinely unknown
 * and a human needs to look. `PaymentService` itself never touches
 * Conversation state or sends a message — that orchestration belongs
 * here, same separation the STK callback route already keeps.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'reconcile-stk-payments', async (job) => {
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
  });
  return scheduledJobService.toResponse(outcome);
}

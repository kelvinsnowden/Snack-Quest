import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';
import { notificationService } from '@/services/notificationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const JOB_NAME = 'reconcile-stk-payments';

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
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const businessId = getCurrentBusinessId();
  const startedAtMs = Date.now();

  try {
    const outcomes = await paymentService.reconcileStuckIntents(businessId);

    for (const outcome of outcomes) {
      if (outcome.outcome === 'confirmedFailed' && outcome.callbackResult) {
        await conversationService.handlePaymentResult(outcome.callbackResult);
      } else if (outcome.outcome === 'needsManualReview' && outcome.reviewReason) {
        await notificationService.notifyAdmin(businessId, `URGENT: ${outcome.reviewReason}`);
      }
    }

    const result = {
      checked: outcomes.length,
      confirmedFailed: outcomes.filter((o) => o.outcome === 'confirmedFailed').length,
      needsManualReview: outcomes.filter((o) => o.outcome === 'needsManualReview').length,
      stillPending: outcomes.filter((o) => o.outcome === 'stillPending').length,
    };

    await scheduledJobRunRepository.record({
      businessId,
      jobName: JOB_NAME,
      status: 'succeeded',
      durationMs: Date.now() - startedAtMs,
      resultSummary: result,
      error: null,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    await scheduledJobRunRepository.record({
      businessId,
      jobName: JOB_NAME,
      status: 'failed',
      durationMs: Date.now() - startedAtMs,
      resultSummary: null,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    throw error;
  }
}

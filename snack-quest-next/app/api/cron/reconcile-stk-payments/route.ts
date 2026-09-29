import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { reconcileStkPayments } from '@/services/jobs/reconcileStkPayments';

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
  const outcome = await scheduledJobService.run(businessId, 'reconcile-stk-payments', (job) => reconcileStkPayments(businessId, job));
  return scheduledJobService.toResponse(outcome);
}

import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { reconcileStuckWithdrawals } from '@/services/jobs/reconcileStuckWithdrawals';

/**
 * The B2C stuck-withdrawal reconciliation sweep's real trigger (§
 * Daraja B2C production readiness, `WithdrawalService.reconcileStuckWithdrawals`)
 * — same Vercel Cron mechanism, same `CRON_SECRET` bearer-token auth,
 * and same single-current-tenant scoping (`getCurrentBusinessId()`) as
 * `reconcile-stk-payments` (see that route's own doc comment for why).
 *
 * Every `needsManualReview` outcome pages the admin WhatsApp number —
 * a withdrawal stuck this long with no definitive Daraja answer is
 * real, ambiguous money, and only a human checking the M-Pesa
 * statement directly can close it out
 * (`WithdrawalService.resolveAmbiguousWithdrawal`). `WithdrawalService`
 * itself never touches notifications — that orchestration belongs
 * here, same separation the STK reconciliation route already keeps.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'reconcile-stuck-withdrawals', (job) => reconcileStuckWithdrawals(businessId, job));
  return scheduledJobService.toResponse(outcome);
}

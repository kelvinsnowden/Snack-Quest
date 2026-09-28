import { withdrawalService } from '@/services/withdrawalService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { notificationService } from '@/services/notificationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';

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
  const outcome = await scheduledJobService.run(businessId, 'reconcile-stuck-withdrawals', async (job) => {
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
  });
  return scheduledJobService.toResponse(outcome);
}

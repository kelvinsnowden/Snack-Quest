import { withdrawalService } from '@/services/withdrawalService';
import { notificationService } from '@/services/notificationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const JOB_NAME = 'reconcile-stuck-withdrawals';

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
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const businessId = getCurrentBusinessId();
  const startedAtMs = Date.now();

  try {
    const outcomes =
      await withdrawalService.reconcileStuckWithdrawals(businessId);

    for (const outcome of outcomes) {
      if (outcome.outcome === 'needsManualReview' && outcome.reviewReason) {
        await notificationService.notifyAdmin(
          businessId,
          `URGENT: ${outcome.reviewReason}`,
        );
      }
    }

    const result = {
      checked: outcomes.length,
      queried: outcomes.filter((o) => o.outcome === 'queried').length,
      needsManualReview: outcomes.filter(
        (o) => o.outcome === 'needsManualReview',
      ).length,
      stillPending: outcomes.filter((o) => o.outcome === 'stillPending').length,
      skipped: outcomes.filter((o) => o.outcome === 'skipped').length,
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

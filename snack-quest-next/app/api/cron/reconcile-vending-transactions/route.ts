import { machineTransactionService } from '@/services/machineTransactionService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const JOB_NAME = 'reconcile-vending-transactions';

/**
 * The vending transaction-timeout sweep's real trigger
 * (§ transaction timeout, docs/VENDING_OS_BENCHMARK.md §C/§H,
 * `MachineTransactionService.reconcileStuckTransactions`) — same
 * Vercel Cron mechanism, same `CRON_SECRET` bearer auth, same
 * single-current-tenant scoping as `reconcile-stk-payments` (see that
 * route's own doc comment for why), applied to a second collection
 * rather than a new pattern.
 *
 * Daily for now, matching every other cron in `vercel.json` — at zero
 * real transaction volume, a stuck transaction sitting undetected for
 * up to a day is a real gap, not a nonexistent one, but it is an
 * honest Phase 1 tradeoff rather than a schedule this deployment tier
 * is known to support more often. Tighten to hourly (or move the
 * detection onto the payment-status poll path itself) once real
 * machines are reporting and a stuck transaction is something that
 * actually happens, not something being planned for in the abstract.
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
    const result = await machineTransactionService.reconcileStuckTransactions(businessId);

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

import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { reconcileVendingTransactions } from '@/services/jobs/reconcileVendingTransactions';

/**
 * The vending transaction-timeout sweep's real trigger
 * (§ transaction timeout, docs/VENDING_OS_BENCHMARK.md §C/§H,
 * `MachineTransactionService.reconcileStuckTransactions` and
 * `.reconcileStuckPendingTransactions`) — same Vercel Cron mechanism,
 * same `CRON_SECRET` bearer auth, same single-current-tenant scoping
 * as `reconcile-stk-payments` (see that route's own doc comment for
 * why), applied to a second collection rather than a new pattern.
 *
 * Two distinct sweeps, both real gaps this closes: `paid`/
 * `vend_authorized` transactions stuck waiting on a device report
 * (`reconcileStuckTransactions`), and `pending` transactions stuck
 * because Daraja's own callback was lost or delayed
 * (`reconcileStuckPendingTransactions` — the vending equivalent of
 * `PaymentService.reconcileStuckIntents`'s `queryStkStatus` fallback,
 * which e-commerce already had and vending did not). A third pass asks
 * outbound manufacturer integrations what happened to dispenses whose
 * outcome is unknown (`reconcileUnknownDispenses`).
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
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'reconcile-vending-transactions', (job) => reconcileVendingTransactions(businessId, job));
  return scheduledJobService.toResponse(outcome);
}

import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { deepReconciliationService } from '@/services/deepReconciliationService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';

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
  const outcome = await scheduledJobService.run(businessId, 'reconcile-vending-transactions', async (job) => {
    // Provable recovery first (refund what was never sent or collected),
    // so the blunt stuck-sale sweep below only sees what truly needs a human.
    const recovery = await job.step('recovery sweep', () => dispenseRecoveryService.sweep(businessId));
    const stuck = await job.step('stuck transactions', () => machineTransactionService.reconcileStuckTransactions(businessId));
    const pending = await job.step('stuck pending payments', () => machineTransactionService.reconcileStuckPendingTransactions(businessId));
    const unknown = await job.step('pull reconciliation', () => machineTransactionService.reconcileUnknownDispenses(businessId));
    // Deep tier: money, dispense and stock ledgers checked against each other; discrepancies become alerts.
    const ledger = await job.step('ledger reconciliation', () => deepReconciliationService.run(businessId));
    (recovery?.itemErrors ?? []).forEach((error) => job.itemError('recovery sweep', error));
    (unknown?.itemErrors ?? []).forEach((error) => job.itemError('pull reconciliation', error));
    return {
      ...(stuck ?? {}),
      ...(pending ?? {}),
      dispensesResolved: unknown?.resolved ?? null,
      dispensesStillUnknown: unknown?.stillUnknown ?? null,
      recoveryExamined: recovery?.examined ?? null,
      ledgerDiscrepancies: ledger?.discrepancies.length ?? null,
    };
  });
  return scheduledJobService.toResponse(outcome);
}

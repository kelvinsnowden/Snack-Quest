import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { deepReconciliationService } from '@/services/deepReconciliationService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const JOB_NAME = 'reconcile-vending-transactions';

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
  const startedAtMs = Date.now();

  try {
    // Provable recovery first (refund what was never sent or collected),
    // so the blunt stuck-sale sweep below only sees what truly needs a human.
    const recovery = await dispenseRecoveryService.sweep(businessId);
    const [stuckResult, pendingResult, unknownDispenses] = await Promise.all([
      machineTransactionService.reconcileStuckTransactions(businessId),
      machineTransactionService.reconcileStuckPendingTransactions(businessId),
      machineTransactionService.reconcileUnknownDispenses(businessId),
    ]);
    // Deep tier: money, dispense and stock ledgers checked against each other; discrepancies become alerts.
    const ledger = await deepReconciliationService.run(businessId);
    const result = {
      ...stuckResult,
      ...pendingResult,
      dispensesResolved: unknownDispenses.resolved,
      dispensesStillUnknown: unknownDispenses.stillUnknown,
      recoveryExamined: recovery.examined,
      ledgerDiscrepancies: ledger.discrepancies.length,
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

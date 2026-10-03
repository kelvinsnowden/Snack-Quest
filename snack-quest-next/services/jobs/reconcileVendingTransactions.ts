import 'server-only';

import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { deepReconciliationService } from '@/services/deepReconciliationService';
import type { JobContext } from '@/services/scheduledJobService';

/** Stuck-sale, stuck-payment, pull and ledger reconciliation. See the cron route for why each pass exists. */
export async function reconcileVendingTransactions(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
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
}

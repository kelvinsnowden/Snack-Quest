import 'server-only';

import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { alertService } from '@/services/alertService';
import type { JobContext } from '@/services/scheduledJobService';

/** Provable recovery of stuck sales, pull reconciliation, then alerts and critical texts. See the cron route for the schedule. */
export async function vendingFastRecovery(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  const sweep = await job.step('recovery sweep', () => dispenseRecoveryService.sweep(businessId));
  const pulled = await job.step('pull reconciliation', () => machineTransactionService.reconcileUnknownDispenses(businessId));
  // Alerts ride the same schedule, so an operator hears about a
  // critical condition within one run, not when someone next opens
  // the dashboard.
  await job.step('alert evaluation', () => alertService.evaluateAndSync(businessId));
  const notified = await job.step('critical alert texts', () => alertService.notifyCritical(businessId));
  (sweep?.itemErrors ?? []).forEach((error) => job.itemError('recovery sweep', error));
  (pulled?.itemErrors ?? []).forEach((error) => job.itemError('pull reconciliation', error));
  return {
    examined: sweep?.examined ?? null,
    ...(sweep?.recovered ?? {}),
    pulledResolved: pulled?.resolved ?? null,
    pulledStillUnknown: pulled?.stillUnknown ?? null,
    alertsNotified: notified?.notified ?? null,
  };
}

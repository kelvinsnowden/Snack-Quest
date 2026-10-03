import 'server-only';

import { machineCommandService } from '@/services/machineCommandService';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { alertService } from '@/services/alertService';
import type { JobContext } from '@/services/scheduledJobService';

/** Stuck commands and dispenses, integration probes, and the backstop for the fast-recovery tier: its recovery sweep and its alert check. */
export async function reconcileVendingCommands(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  const commands = await job.step('stuck remote commands', () => machineCommandService.reconcileStuckCommands(businessId));
  const dispenses = await job.step('timed-out dispenses', () => dispenseCommandService.sweepTimedOut(businessId));
  const probe = await job.step('integration probes', () => machineIntegrationService.probeActiveOutboundIntegrations(businessId));
  // Backstop for the fast-recovery tier, in case no external scheduler runs it.
  const recovery = await job.step('recovery sweep', () => dispenseRecoveryService.sweep(businessId));
  (recovery?.itemErrors ?? []).forEach((error) => job.itemError('recovery sweep', error));
  // Pages never run the alert check, so without the fast-recovery scheduler this daily run is what keeps alerts
  // (including "a job is overdue") from going unchecked.
  await job.step('alert evaluation', () => alertService.evaluateAndSync(businessId));
  return {
    ...(commands ?? {}),
    dispenseTimedOut: dispenses?.timedOut ?? null,
    integrationsProbed: probe?.probed ?? null,
    integrationProbesFailed: probe?.failed ?? null,
    recoveryExamined: recovery?.examined ?? null,
  };
}

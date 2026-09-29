import 'server-only';

import { machineCommandService } from '@/services/machineCommandService';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import type { JobContext } from '@/services/scheduledJobService';

/** Stuck commands and dispenses, integration probes, and the recovery backstop. */
export async function reconcileVendingCommands(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  const commands = await job.step('stuck remote commands', () => machineCommandService.reconcileStuckCommands(businessId));
  const dispenses = await job.step('timed-out dispenses', () => dispenseCommandService.sweepTimedOut(businessId));
  const probe = await job.step('integration probes', () => machineIntegrationService.probeActiveOutboundIntegrations(businessId));
  // Backstop for the fast-recovery tier, in case no external scheduler runs it.
  const recovery = await job.step('recovery sweep', () => dispenseRecoveryService.sweep(businessId));
  (recovery?.itemErrors ?? []).forEach((error) => job.itemError('recovery sweep', error));
  return {
    ...(commands ?? {}),
    dispenseTimedOut: dispenses?.timedOut ?? null,
    integrationsProbed: probe?.probed ?? null,
    integrationProbesFailed: probe?.failed ?? null,
    recoveryExamined: recovery?.examined ?? null,
  };
}

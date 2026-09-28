import { machineCommandService } from '@/services/machineCommandService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';

/**
 * The command-timeout sweep's real trigger (§ types/machineCommand.ts,
 * `MachineCommandService.reconcileStuckCommands`) — same mechanism as
 * `reconcile-vending-transactions`: Vercel Cron, `CRON_SECRET` bearer
 * auth, single-current-tenant scoping, applied to a third collection
 * rather than a new pattern.
 *
 * Also runs the two integration-layer sweeps that share its cadence:
 * dispense commands stuck in flight become `timeout`
 * (`DispenseCommandService.sweepTimedOut`), and every active outbound
 * integration is re-tested so its health reflects reality even with no
 * sales traffic (`MachineIntegrationService.probeActiveOutboundIntegrations`).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'reconcile-vending-commands', async (job) => {
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
  });
  return scheduledJobService.toResponse(outcome);
}

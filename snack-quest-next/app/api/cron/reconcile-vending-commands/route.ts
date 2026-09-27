import { machineCommandService } from '@/services/machineCommandService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const JOB_NAME = 'reconcile-vending-commands';

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
  const startedAtMs = Date.now();

  try {
    const [commands, dispenses, probe] = await Promise.all([
      machineCommandService.reconcileStuckCommands(businessId),
      dispenseCommandService.sweepTimedOut(businessId),
      machineIntegrationService.probeActiveOutboundIntegrations(businessId),
    ]);
    // Backstop for the fast-recovery tier, in case no external scheduler runs it.
    const recovery = await dispenseRecoveryService.sweep(businessId);
    const result = { ...commands, dispenseTimedOut: dispenses.timedOut, integrationsProbed: probe.probed, integrationProbesFailed: probe.failed, recoveryExamined: recovery.examined };

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

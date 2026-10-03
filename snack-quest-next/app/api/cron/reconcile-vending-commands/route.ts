import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { reconcileVendingCommands } from '@/services/jobs/reconcileVendingCommands';

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
  const outcome = await scheduledJobService.run(businessId, 'reconcile-vending-commands', (job) => reconcileVendingCommands(businessId, job));
  return scheduledJobService.toResponse(outcome);
}

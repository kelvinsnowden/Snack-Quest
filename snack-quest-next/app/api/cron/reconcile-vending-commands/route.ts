import { machineCommandService } from '@/services/machineCommandService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

const JOB_NAME = 'reconcile-vending-commands';

/**
 * The command-timeout sweep's real trigger (§ types/machineCommand.ts,
 * `MachineCommandService.reconcileStuckCommands`) — same mechanism as
 * `reconcile-vending-transactions`: Vercel Cron, `CRON_SECRET` bearer
 * auth, single-current-tenant scoping, applied to a third collection
 * rather than a new pattern.
 */
export async function GET(request: Request): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const businessId = getCurrentBusinessId();
  const startedAtMs = Date.now();

  try {
    const result = await machineCommandService.reconcileStuckCommands(businessId);

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

import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { logger } from '@/lib/observability/logger';

const JOB_NAME = 'vending-fast-recovery';

/**
 * The fast-recovery tier (docs/MACHINE_INTEGRATION_LAYER.md §7): every
 * sale stuck between payment and outcome that can be resolved provably
 * — refunds for dispenses never sent or never collected, review for
 * ones that may have dispensed — plus pull reconciliation of outbound
 * unknowns on their backoff schedule.
 *
 * Built to run every 1–5 minutes and cheap when nothing is stuck (a few
 * index queries returning nothing). Vercel Hobby only schedules daily
 * crons, so this is triggered by an external scheduler with the
 * CRON_SECRET (see .github/workflows/vending-fast-recovery.yml); the
 * daily reconcile-vending-commands cron runs the same sweep as a
 * backstop. Most recovery happens before either: on the customer's own
 * status poll and on the machine's command poll.
 *
 * Idempotent: safe to run concurrently and repeatedly.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const startedAtMs = Date.now();
  try {
    const sweep = await dispenseRecoveryService.sweep(businessId);
    const pulled = await machineTransactionService.reconcileUnknownDispenses(businessId);
    const result = { examined: sweep.examined, ...sweep.recovered, pulledResolved: pulled.resolved, pulledStillUnknown: pulled.stillUnknown };
    await scheduledJobRunRepository.record({ businessId, jobName: JOB_NAME, status: 'succeeded', durationMs: Date.now() - startedAtMs, resultSummary: result, error: null });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.error('fast recovery failed', { error });
    await scheduledJobRunRepository.record({ businessId, jobName: JOB_NAME, status: 'failed', durationMs: Date.now() - startedAtMs, resultSummary: null, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

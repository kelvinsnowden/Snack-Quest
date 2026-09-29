import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { vendingFastRecovery } from '@/services/jobs/vendingFastRecovery';

/**
 * The fast-recovery tier (docs/MACHINE_INTEGRATION_LAYER.md §7): every
 * sale stuck between payment and outcome that can be resolved provably
 * — refunds for dispenses never sent or never collected, review for
 * ones that may have dispensed — plus pull reconciliation of outbound
 * unknowns on their backoff schedule, then the alert sweep and
 * critical-alert texts.
 *
 * Built to run every 1–5 minutes and cheap when nothing is stuck (a few
 * index queries returning nothing). Vercel Hobby only schedules daily
 * crons, so this is triggered by an external scheduler with the
 * CRON_SECRET (see .github/workflows/vending-fast-recovery.yml); the
 * daily reconcile-vending-commands cron runs the same sweep as a
 * backstop. Most recovery happens before either: on the customer's own
 * status poll and on the machine's command poll.
 *
 * Idempotent: safe to run concurrently and repeatedly (an overlapping run is
 * skipped by the job lease; see `scheduledJobService.run`).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'vending-fast-recovery', (job) => vendingFastRecovery(businessId, job));
  return scheduledJobService.toResponse(outcome);
}

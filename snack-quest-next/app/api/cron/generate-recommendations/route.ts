import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { recommendationEngineService } from '@/services/recommendationEngineService';

/**
 * Nightly recommendations: restock and dead-stock for every selling
 * machine, then network-wide product opportunities. Scheduled after
 * `rebuild-vending-rollups` (05:00 UTC) so it reads yesterday's rebuilt
 * numbers. Writes `pending` recommendations only; nothing is ever acted
 * on without a person approving it.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'generate-recommendations', (job) =>
    recommendationEngineService.generateForFleet(businessId, 'system:generate-recommendations', (machineId, error) => job.itemError(`machine ${machineId}`, error)),
  );
  return scheduledJobService.toResponse(outcome);
}

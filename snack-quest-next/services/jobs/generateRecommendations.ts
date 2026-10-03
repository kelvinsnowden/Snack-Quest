import 'server-only';

import { recommendationEngineService } from '@/services/recommendationEngineService';
import type { JobContext } from '@/services/scheduledJobService';

/** Restock and dead-stock for every selling machine, then product opportunities. Writes `pending` recommendations only. */
export async function generateRecommendations(businessId: string, job: JobContext, actorId = 'system:generate-recommendations'): Promise<Record<string, unknown>> {
  const summary = await recommendationEngineService.generateForFleet(businessId, actorId, (machineId, error) => job.itemError(`machine ${machineId}`, error));
  return { ...summary };
}

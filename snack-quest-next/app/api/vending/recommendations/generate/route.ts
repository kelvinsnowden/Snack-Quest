import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { scheduledJobService } from '@/services/scheduledJobService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

type GenerateScope = 'restock' | 'dead_stock' | 'product_opportunities' | 'fleet';
const VALID_SCOPES: GenerateScope[] = ['restock', 'dead_stock', 'product_opportunities', 'fleet'];

/**
 * On-demand recommendation generation (§ RESTOCK/DEAD STOCK/PRODUCT
 * OPPORTUNITY, feeding § RECOMMENDATION ENGINE). `restock`/`dead_stock`
 * need a `machineId` — a per-machine analysis; `product_opportunities`
 * is network-wide. `fleet` runs all of them for every selling machine —
 * the same run as the nightly `generate-recommendations` job, recorded
 * under that job's name so the two can never overlap and Operations
 * shows it. Writes `pending` recommendation records; never executes
 * anything itself.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'recommendations.act')) {
    return forbiddenForPermission('recommendations.act');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { scope, machineId } = (body ?? {}) as Record<string, unknown>;
  if (typeof scope !== 'string' || !VALID_SCOPES.includes(scope as GenerateScope)) {
    return Response.json({ error: `scope must be one of: ${VALID_SCOPES.join(', ')}` }, { status: 400 });
  }
  if ((scope === 'restock' || scope === 'dead_stock') && typeof machineId !== 'string') {
    return Response.json({ error: 'machineId is required for this scope' }, { status: 400 });
  }

  if (scope === 'fleet') {
    const outcome = await scheduledJobService.run(session.businessId, 'generate-recommendations', (job) =>
      recommendationEngineService.generateForFleet(session.businessId, session.uid, (id, error) => job.itemError(`machine ${id}`, error)),
    );
    if (outcome.status === 'skipped') {
      return Response.json({ error: 'Recommendations are already being generated. Try again in a few minutes.' }, { status: 409 });
    }
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'generate_recommendations',
      entityType: 'intelligenceRecommendation',
      entityId: outcome.runId ?? 'fleet',
      after: { ...outcome.summary, status: outcome.status },
    });
    return Response.json({ status: outcome.status, summary: outcome.summary, errors: outcome.errors }, { status: outcome.status === 'failed' ? 500 : 201 });
  }

  try {
    let created: string[];
    if (scope === 'restock') {
      created = await recommendationEngineService.generateRestockRecommendations(session.businessId, machineId as string, session.uid);
    } else if (scope === 'dead_stock') {
      created = await recommendationEngineService.generateDeadStockRecommendations(session.businessId, machineId as string, session.uid);
    } else {
      created = await recommendationEngineService.generateProductOpportunityRecommendations(session.businessId, session.uid);
    }
    return Response.json({ recommendationIds: created }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

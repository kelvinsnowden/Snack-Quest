import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { MachineNotFoundError } from '@/repositories/machineRepository';

type GenerateScope = 'restock' | 'dead_stock' | 'product_opportunities';
const VALID_SCOPES: GenerateScope[] = ['restock', 'dead_stock', 'product_opportunities'];

/**
 * On-demand recommendation generation (§ RESTOCK/DEAD STOCK/PRODUCT
 * OPPORTUNITY, feeding § RECOMMENDATION ENGINE). `restock`/`dead_stock`
 * need a `machineId` — a per-machine analysis; `product_opportunities`
 * is network-wide. Writes `pending` recommendation records; never
 * executes anything itself.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
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
  if (scope !== 'product_opportunities' && typeof machineId !== 'string') {
    return Response.json({ error: 'machineId is required for this scope' }, { status: 400 });
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

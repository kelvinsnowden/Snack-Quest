import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { serializeIntelligenceRecommendation } from '@/lib/vending/serialize';
import type { RecommendationStatus, RecommendationType } from '@/types';

const VALID_TYPES: RecommendationType[] = ['RESTOCK', 'ASSORTMENT_CHANGE', 'REMOVE_PRODUCT', 'MOVE_PRODUCT', 'PRICE_REVIEW', 'PRODUCT_OPPORTUNITY', 'LOCATION_PROFILE'];
const VALID_STATUSES: RecommendationStatus[] = ['pending', 'approved', 'dismissed'];

/** The full, staff-facing recommendation list (§ RECOMMENDATION ENGINE) — every recommendation this codebase has ever produced, filterable by type/status. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get('type');
  const statusParam = url.searchParams.get('status');
  if (typeParam && !VALID_TYPES.includes(typeParam as RecommendationType)) {
    return Response.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }
  if (statusParam && !VALID_STATUSES.includes(statusParam as RecommendationStatus)) {
    return Response.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const rows = await recommendationEngineService.listByBusiness(session.businessId, {
    type: typeParam as RecommendationType | undefined,
    status: statusParam as RecommendationStatus | undefined,
  });
  return Response.json({ recommendations: rows.map(({ id, data }) => serializeIntelligenceRecommendation(id, data)) });
}

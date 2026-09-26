import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { productIntelligenceService } from '@/services/productIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/** Network-wide per-SKU performance (§ PRODUCT INTELLIGENCE) — never ranked by revenue alone; the full record (velocity, margin, stockout frequency, locations stocked vs. selling) is returned for the caller to sort. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  const products = await productIntelligenceService.getNetworkProductPerformance(session.businessId, windowDays);
  return Response.json({ products });
}

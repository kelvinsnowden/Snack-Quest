import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { productIntelligenceService } from '@/services/productIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/** Per-product performance across one location's own machines (§ PRODUCT INTELLIGENCE, § LOCATION DNA). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  const products = await productIntelligenceService.getLocationProductPerformance(session.businessId, id, windowDays);
  return Response.json({ products });
}

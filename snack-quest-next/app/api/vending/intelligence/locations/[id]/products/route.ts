import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { productIntelligenceService } from '@/services/productIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Per-product performance across one location's own machines (§ PRODUCT INTELLIGENCE, § LOCATION DNA). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'analytics.vending.view')) {
    return forbiddenForPermission('analytics.vending.view');
  }

  const { id } = await params;
  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  const products = await productIntelligenceService.getLocationProductPerformance(session.businessId, id, windowDays);
  return Response.json({ products });
}

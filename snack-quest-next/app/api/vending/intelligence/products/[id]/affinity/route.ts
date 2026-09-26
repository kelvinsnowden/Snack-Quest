import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { peerLearningService } from '@/services/peerLearningService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/** How one product performs across location types (§ LOCATION-TO-LOCATION LEARNING) — a grouped average, only naming a best-performing type once real, observed data supports it. */
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

  const affinity = await peerLearningService.getProductLocationTypeAffinity(session.businessId, id, windowDays);
  return Response.json({ affinity });
}

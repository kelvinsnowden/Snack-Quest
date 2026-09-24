import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { peerLearningService } from '@/services/peerLearningService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/** Deterministic product opportunity detection (§ PRODUCT OPPORTUNITY ENGINE) — every result carries a `reason` and `supportingMetrics`; nothing here is a probability. */
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

  const opportunities = await peerLearningService.findProductOpportunities(session.businessId, windowDays);
  return Response.json({ opportunities });
}

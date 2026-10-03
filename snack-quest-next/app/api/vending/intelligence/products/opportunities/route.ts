import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { peerLearningService } from '@/services/peerLearningService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Deterministic product opportunity detection (§ PRODUCT OPPORTUNITY ENGINE) — every result carries a `reason` and `supportingMetrics`; nothing here is a probability. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'analytics.vending.view')) {
    return forbiddenForPermission('analytics.vending.view');
  }

  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  const opportunities = await peerLearningService.findProductOpportunities(session.businessId, windowDays);
  return Response.json({ opportunities });
}

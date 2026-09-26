import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/** The whole-fleet overview (§ NETWORK INTELLIGENCE) — composed from `networkDailySummary`, staff-only. */
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

  const overview = await networkIntelligenceService.getNetworkOverview(session.businessId, windowDays);
  return Response.json({ overview });
}

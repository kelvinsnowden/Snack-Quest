import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** The whole-fleet overview (§ NETWORK INTELLIGENCE) — composed from `networkDailySummary`, staff-only. */
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

  const overview = await networkIntelligenceService.getNetworkOverview(session.businessId, windowDays);
  return Response.json({ overview });
}

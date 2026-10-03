import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Location-type performance (§ NETWORK INTELLIGENCE: "location-type performance") — grouped, never a single ranked winner. */
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

  const performance = await networkIntelligenceService.getLocationTypePerformance(session.businessId, windowDays);
  return Response.json({ performance });
}

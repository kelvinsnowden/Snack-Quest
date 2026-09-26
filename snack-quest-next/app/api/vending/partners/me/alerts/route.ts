import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';

/** § ALERTS & NOTIFICATIONS — the owner's own machines only, never the fleet-wide Alert Center's full list. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const alerts = await ownerPortalService.getAlerts(session.businessId, session.partnerId);
  return Response.json({ alerts });
}

import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';

/**
 * The Owner Portal's own home screen (§ PART 2 — OWNER PORTAL,
 * § OWNER DASHBOARD). Scoped entirely by the partner's own session —
 * `partnerId` never comes from the request, so there is nothing a
 * partner could pass to reach another partner's dashboard.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dashboard = await ownerPortalService.getDashboard(session.businessId, session.partnerId);
  return Response.json({ dashboard });
}

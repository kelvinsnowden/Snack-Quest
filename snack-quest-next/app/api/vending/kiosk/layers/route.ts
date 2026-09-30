import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { kioskExperienceService } from '@/services/kioskExperienceService';

/** Every screen design layer this business has, fleet-wide first (§ KIOSK EXPERIENCE BUILDER). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.view')) return forbiddenForPermission('kiosk.view');
  const layers = await kioskExperienceService.listLayers(session.businessId);
  return Response.json({
    layers: layers.map(({ id, data }) => ({ id, scope: data.scope, scopeId: data.scopeId, publishedVersionNumber: data.publishedVersionId ? data.publishedVersionNumber : null })),
  });
}

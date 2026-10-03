import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { peerLearningService } from '@/services/peerLearningService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** How one product performs across location types (§ LOCATION-TO-LOCATION LEARNING) — a grouped average, only naming a best-performing type once real, observed data supports it. */
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

  const affinity = await peerLearningService.getProductLocationTypeAffinity(session.businessId, id, windowDays);
  return Response.json({ affinity });
}

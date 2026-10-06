import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody } from '@/lib/ads/routeHelpers';
import { maintenanceErrorResponse, serializeRequestForOwner } from '@/lib/maintenance/http';
import { maintenanceService } from '@/services/maintenanceService';

/** An owner withdraws one of their own requests: `{ reason }`. Someone else's request reads as not found. */
export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { requestId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const after = await maintenanceService.cancelByOwner(session.businessId, session.partnerId, requestId, session.uid, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'maintenance.request.cancel', entityType: 'maintenanceRequest', entityId: requestId, after: { status: 'cancelled' }, machineId: after.machineId, source: 'owner_portal' });
    return Response.json({ request: serializeRequestForOwner(requestId, after) });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

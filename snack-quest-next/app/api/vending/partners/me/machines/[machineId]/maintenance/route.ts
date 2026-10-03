import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody } from '@/lib/ads/routeHelpers';
import { maintenanceErrorResponse, serializeCostForOwner, serializeRequestForOwner } from '@/lib/maintenance/http';
import { maintenanceService } from '@/services/maintenanceService';

type Params = { params: Promise<{ machineId: string }> };

/** An owner's maintenance on one of their machines: their requests and the costs they bore. Another owner's machine reads as not found. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { machineId } = await params;
  try {
    const { requests, costs } = await maintenanceService.forOwnerMachine(session.businessId, session.partnerId, machineId);
    return Response.json({
      requests: requests.map(({ id, data }) => serializeRequestForOwner(id, data)),
      costs: costs.map(({ id, data }) => serializeCostForOwner(id, data)),
    });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

/** Report a problem: `{ category, description, urgency? }`. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { machineId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const id = await maintenanceService.raiseByOwner(session.businessId, session.partnerId, machineId, session.uid, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'maintenance.request.create', entityType: 'maintenanceRequest', entityId: id, after: { category: body.category, urgency: body.urgency ?? 'normal' }, machineId, source: 'owner_portal' });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

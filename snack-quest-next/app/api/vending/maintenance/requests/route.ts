import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { maintenanceErrorResponse, serializeRequest } from '@/lib/maintenance/http';
import { maintenanceService } from '@/services/maintenanceService';

/** Maintenance requests (§ MAINTENANCE). List with `maintenance.view` (`?status=`, `?machineId=`); log one with `maintenance.manage`. */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['maintenance.view']);
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  try {
    const rows = await maintenanceService.listRequests(session.businessId, { status: url.searchParams.get('status') ?? undefined, machineId: url.searchParams.get('machineId') ?? undefined });
    return Response.json({ requests: rows.map(({ id, data }) => serializeRequest(id, data)) });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['maintenance.manage']);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  if (typeof body.machineId !== 'string' || !body.machineId) return Response.json({ error: 'machineId is required' }, { status: 400 });
  try {
    const id = await maintenanceService.raiseByStaff(session.businessId, body.machineId, session.uid, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'maintenance.request.create', entityType: 'maintenanceRequest', entityId: id, after: { category: body.category, urgency: body.urgency ?? 'normal' }, machineId: body.machineId });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

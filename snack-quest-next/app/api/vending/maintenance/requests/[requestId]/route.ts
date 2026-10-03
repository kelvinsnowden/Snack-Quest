import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { maintenanceErrorResponse, serializeCost, serializeRequest } from '@/lib/maintenance/http';
import { maintenanceService } from '@/services/maintenanceService';
import { maintenanceRepository } from '@/repositories/maintenanceRepository';

type Params = { params: Promise<{ requestId: string }> };

/** One request with the costs recorded against it (`maintenance.view`). */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const session = await staffWith(request, ['maintenance.view']);
  if (session instanceof Response) return session;
  const { requestId } = await params;
  try {
    const data = await maintenanceService.findRequest(session.businessId, requestId);
    const costs = await maintenanceRepository.listCostsForRequest(session.businessId, requestId);
    return Response.json({ request: serializeRequest(requestId, data), costs: costs.map(({ id, data: cost }) => serializeCost(id, cost)) });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

/** Move a request on: `{ status, note?, scheduledFor?, resolution? }` (`maintenance.manage`). */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const session = await staffWith(request, ['maintenance.manage']);
  if (session instanceof Response) return session;
  const { requestId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const before = await maintenanceService.findRequest(session.businessId, requestId);
    const after = await maintenanceService.updateByStaff(session.businessId, requestId, session.uid, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'maintenance.request.update', entityType: 'maintenanceRequest', entityId: requestId, before: { status: before.status }, after: { status: after.status, scheduledFor: after.scheduledFor }, machineId: after.machineId });
    return Response.json({ request: serializeRequest(requestId, after) });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

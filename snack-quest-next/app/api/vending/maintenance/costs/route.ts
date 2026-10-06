import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { maintenanceErrorResponse, serializeCost } from '@/lib/maintenance/http';
import { maintenanceService } from '@/services/maintenanceService';

/**
 * Maintenance costs (§ MAINTENANCE). List with `maintenance.view`: one
 * machine's (`?machineId=`, optional `?from=`/`?to=` dates) or the most
 * recent across the business. Record one with `maintenance.costs.record`.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['maintenance.view']);
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const machineId = url.searchParams.get('machineId');
  const rows = machineId
    ? await maintenanceService.listCostsForMachine(session.businessId, machineId, { fromDate: url.searchParams.get('from') ?? undefined, toDate: url.searchParams.get('to') ?? undefined })
    : await maintenanceService.listRecentCosts(session.businessId);
  return Response.json({ costs: rows.map(({ id, data }) => serializeCost(id, data)) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['maintenance.costs.record']);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const id = await maintenanceService.recordCost(session.businessId, session.uid, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'maintenance.cost.record', entityType: 'maintenanceCost', entityId: id, after: { amountKes: body.amountKes, paidBy: body.paidBy, occurredOn: body.occurredOn, requestId: body.requestId ?? null }, machineId: typeof body.machineId === 'string' ? body.machineId : undefined });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

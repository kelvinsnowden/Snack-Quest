import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { maintenanceErrorResponse } from '@/lib/maintenance/http';
import { maintenanceService } from '@/services/maintenanceService';

/** Void a cost recorded in error: `{ reason }` (`maintenance.costs.record`). The cost stays on record, marked void, and counts nowhere. */
export async function POST(request: Request, { params }: { params: Promise<{ costId: string }> }): Promise<Response> {
  const session = await staffWith(request, ['maintenance.costs.record']);
  if (session instanceof Response) return session;
  const { costId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const cost = await maintenanceService.findCost(session.businessId, costId);
    await maintenanceService.voidCost(session.businessId, costId, session.uid, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'maintenance.cost.void', entityType: 'maintenanceCost', entityId: costId, before: { amountKes: cost.amountKes, paidBy: cost.paidBy }, after: { voided: true, reason: body.reason }, machineId: cost.machineId });
    return Response.json({ ok: true });
  } catch (error) {
    return maintenanceErrorResponse(error);
  }
}

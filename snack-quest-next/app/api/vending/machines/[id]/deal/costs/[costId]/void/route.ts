import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { machineDealErrorResponse } from '@/lib/finance/machineDealHttp';
import { machineDealService } from '@/services/machineDealService';

/** Voids a machine cost line with a reason: `{ reason }` (`machines.deals.manage`). Kept in the ledger, never deleted. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; costId: string }> }): Promise<Response> {
  const session = await staffWith(request, ['machines.deals.manage']);
  if (session instanceof Response) return session;
  const { id, costId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const before = await machineDealService.voidCost(session.businessId, session.uid, costId, body.reason);
    if (before.machineId !== id) return Response.json({ error: 'not found' }, { status: 404 });
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'machine_deal.cost.void', entityType: 'machineCostLine', entityId: costId, before: { category: before.category, amountKes: before.amountKes }, after: { reason: body.reason }, machineId: id });
    return Response.json({ ok: true });
  } catch (error) {
    return machineDealErrorResponse(error);
  }
}

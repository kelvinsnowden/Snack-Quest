import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { machineDealErrorResponse } from '@/lib/finance/machineDealHttp';
import { machineDealService } from '@/services/machineDealService';

/** Records one landed or installation cost on this machine: `{ category, description, amountKes, occurredOn }` (`machines.deals.manage`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['machines.deals.manage']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const costId = await machineDealService.recordCost(session.businessId, session.uid, id, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'machine_deal.cost.record', entityType: 'machineCostLine', entityId: costId, after: { category: body.category, amountKes: body.amountKes, occurredOn: body.occurredOn }, machineId: id });
    return Response.json({ id: costId }, { status: 201 });
  } catch (error) {
    return machineDealErrorResponse(error);
  }
}

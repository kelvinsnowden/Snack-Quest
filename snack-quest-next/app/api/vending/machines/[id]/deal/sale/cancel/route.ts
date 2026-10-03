import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { machineDealErrorResponse } from '@/lib/finance/machineDealHttp';
import { machineDealService } from '@/services/machineDealService';

/** Cancels the recorded sale with a reason: `{ reason }` (`machines.deals.manage`). The cancelled sale is kept. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['machines.deals.manage']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const before = await machineDealService.cancelSale(session.businessId, session.uid, id, body.reason);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'machine_deal.sale.cancel', entityType: 'machineDeal', entityId: id, before: { soldOn: before.soldOn, machinePriceKes: before.machinePriceKes, installationChargeKes: before.installationChargeKes }, after: { reason: body.reason }, machineId: id });
    return Response.json({ ok: true });
  } catch (error) {
    return machineDealErrorResponse(error);
  }
}

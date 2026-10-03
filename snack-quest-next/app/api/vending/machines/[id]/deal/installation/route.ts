import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { machineDealErrorResponse } from '@/lib/finance/machineDealHttp';
import { machineDealService } from '@/services/machineDealService';

/** States that this machine had no installation cost, so none is missing: `{ noInstallationCost }` (`machines.deals.manage`). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['machines.deals.manage']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    await machineDealService.setNoInstallationCost(session.businessId, id, body.noInstallationCost);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'machine_deal.installation.set', entityType: 'machineDeal', entityId: id, after: { noInstallationCost: body.noInstallationCost }, machineId: id });
    return Response.json({ ok: true });
  } catch (error) {
    return machineDealErrorResponse(error);
  }
}

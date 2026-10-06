import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { machineDealErrorResponse, serializeSale } from '@/lib/finance/machineDealHttp';
import { machineDealService } from '@/services/machineDealService';

/** Records the machine's sale to an owner: `{ soldOn, machinePriceKes, installationChargeKes?, buyerPartnerId?, note? }` (`machines.deals.manage`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['machines.deals.manage']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const sale = await machineDealService.recordSale(session.businessId, session.uid, id, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'machine_deal.sale.record', entityType: 'machineDeal', entityId: id, after: { soldOn: sale.soldOn, machinePriceKes: sale.machinePriceKes, installationChargeKes: sale.installationChargeKes, buyerPartnerId: sale.buyerPartnerId }, machineId: id });
    return Response.json({ sale: serializeSale(sale) }, { status: 201 });
  } catch (error) {
    return machineDealErrorResponse(error);
  }
}

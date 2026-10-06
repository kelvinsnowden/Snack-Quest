import { staffWith } from '@/lib/ads/routeHelpers';
import { machineDealErrorResponse, serializeCostLine, serializeSale } from '@/lib/finance/machineDealHttp';
import { machineDealService } from '@/services/machineDealService';

/** What this machine cost to land and install, and what it sold for (`machines.deals.view`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['machines.deals.view']);
  if (session instanceof Response) return session;
  const { id } = await params;
  try {
    const view = await machineDealService.forMachine(session.businessId, id);
    return Response.json({ costs: view.costs.map(({ id: costId, data }) => serializeCostLine(costId, data)), sale: serializeSale(view.deal?.sale ?? null), noInstallationCost: view.deal?.noInstallationCost ?? false, summary: view.summary });
  } catch (error) {
    return machineDealErrorResponse(error);
  }
}

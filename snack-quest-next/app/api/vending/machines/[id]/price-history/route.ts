import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { mergePriceHistory } from '@/lib/vending/priceHistory';

/**
 * One product's price history on one machine (`machines.view` — the
 * prices themselves are already visible on the machine): every slot
 * price change while it was in a slot, and every machine price override.
 * `?productId=` is required.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.view')) return forbiddenForPermission('machines.view');
  const { id } = await params;
  const productId = new URL(request.url).searchParams.get('productId');
  if (!productId) return Response.json({ error: 'productId is required' }, { status: 400 });
  const [slotChanges, overrideChanges] = await Promise.all([
    machineSlotRepository.listPriceHistory(session.businessId, id, productId),
    machineAssortmentRepository.listPriceHistory(session.businessId, id, productId),
  ]);
  return Response.json({ history: mergePriceHistory(slotChanges, overrideChanges) });
}

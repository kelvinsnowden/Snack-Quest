import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { machineSettlementService } from '@/services/machineSettlementService';
import { serializeMachineSettlement } from '@/lib/vending/serialize';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Every settlement across a partner's fleet, newest period first (§ SETTLEMENT). */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owner_finance.view')) {
    return forbiddenForPermission('owner_finance.view');
  }

  const { partnerId } = await params;
  const rows = await machineSettlementService.listByPartner(session.businessId, partnerId);
  return Response.json({ settlements: rows.map(({ id, data }) => serializeMachineSettlement(id, data)) });
}

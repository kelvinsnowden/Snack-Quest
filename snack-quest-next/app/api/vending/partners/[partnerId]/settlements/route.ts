import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSettlementService } from '@/services/machineSettlementService';
import { serializeMachineSettlement } from '@/lib/vending/serialize';

/** Every settlement across a partner's fleet, newest period first (§ SETTLEMENT). */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { partnerId } = await params;
  const rows = await machineSettlementService.listByPartner(session.businessId, partnerId);
  return Response.json({ settlements: rows.map(({ id, data }) => serializeMachineSettlement(id, data)) });
}

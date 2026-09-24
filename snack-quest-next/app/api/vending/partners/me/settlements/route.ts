import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { machineSettlementService } from '@/services/machineSettlementService';
import { serializeMachineSettlement } from '@/lib/vending/serialize';

/** Every settlement across the signed-in partner's own fleet, newest period first (§ SETTLEMENT, § SUBSCRIPTION payment history). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rows = await machineSettlementService.listByPartner(session.businessId, session.partnerId);
  return Response.json({ settlements: rows.map(({ id, data }) => serializeMachineSettlement(id, data)) });
}

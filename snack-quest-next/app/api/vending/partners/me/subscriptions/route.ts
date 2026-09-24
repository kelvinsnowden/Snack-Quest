import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { serializeMachineSubscription } from '@/lib/vending/serialize';

/** Every subscription across the signed-in partner's own fleet (§ SUBSCRIPTION). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rows = await machineSubscriptionService.listByPartner(session.businessId, session.partnerId);
  return Response.json({ subscriptions: rows.map(({ id, data }) => serializeMachineSubscription(id, data)) });
}

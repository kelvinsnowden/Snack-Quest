import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { serializeMachineSubscription } from '@/lib/vending/serialize';

/** Every subscription across a partner's fleet (§ SUBSCRIPTION) — one read for "what does this owner owe across all their machines". */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { partnerId } = await params;
  const rows = await machineSubscriptionService.listByPartner(session.businessId, partnerId);
  return Response.json({ subscriptions: rows.map(({ id, data }) => serializeMachineSubscription(id, data)) });
}

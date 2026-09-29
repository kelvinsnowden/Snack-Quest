import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { serializeMachineSubscription } from '@/lib/vending/serialize';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Every subscription across a partner's fleet (§ SUBSCRIPTION) — one read for "what does this owner owe across all their machines". */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ partnerId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owner_finance.view')) {
    return forbiddenForPermission('owner_finance.view');
  }

  const { partnerId } = await params;
  const rows = await machineSubscriptionService.listByPartner(
    session.businessId,
    partnerId,
  );
  return Response.json({
    subscriptions: rows.map(({ id, data }) =>
      serializeMachineSubscription(id, data),
    ),
  });
}

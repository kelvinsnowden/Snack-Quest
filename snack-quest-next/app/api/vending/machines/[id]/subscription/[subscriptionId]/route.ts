import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { machineSubscriptionRepository, MachineSubscriptionNotFoundError, IllegalSubscriptionTransitionError } from '@/repositories/machineSubscriptionRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const VALID_ACTIONS = ['recordPayment', 'waivePeriod', 'pause', 'resume', 'cancel'] as const;
type Action = (typeof VALID_ACTIONS)[number];

/**
 * The subscription lifecycle actions (§ SUBSCRIPTION,
 * docs/MACHINE_COMMERCE.md §5) — one `action` field rather than one
 * route per verb, since every action here is a staff-recorded fact
 * about the same document, not an independent resource.
 * `ADMIN_ONLY`, same bar as creating one.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; subscriptionId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { id: machineId, subscriptionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { action } = (body ?? {}) as Record<string, unknown>;
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as Action)) {
    return Response.json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }

  try {
    const before = await machineSubscriptionRepository.findById(session.businessId, subscriptionId);
    switch (action as Action) {
      case 'recordPayment':
        await machineSubscriptionService.recordPeriodPayment(session.businessId, subscriptionId);
        break;
      case 'waivePeriod':
        await machineSubscriptionService.recordPeriodPayment(session.businessId, subscriptionId, { waived: true });
        break;
      case 'pause':
        await machineSubscriptionService.pauseSubscription(session.businessId, subscriptionId);
        break;
      case 'resume':
        await machineSubscriptionService.resumeSubscription(session.businessId, subscriptionId);
        break;
      case 'cancel':
        await machineSubscriptionService.cancelSubscription(session.businessId, subscriptionId);
        break;
    }
    const after = await machineSubscriptionRepository.findById(session.businessId, subscriptionId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: `subscription_${action}`,
      entityType: 'machineSubscription',
      entityId: subscriptionId,
      before: before ? { status: before.status, lastPaymentStatus: before.lastPaymentStatus, arrearsKes: before.arrearsKes } : null,
      after: after ? { status: after.status, lastPaymentStatus: after.lastPaymentStatus, arrearsKes: after.arrearsKes } : null,
      machineId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineSubscriptionNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalSubscriptionTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'could not update subscription' }, { status: 400 });
  }
}

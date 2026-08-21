import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { paymentService } from '@/services/paymentService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Asks Safaricom what happened to payments that are stuck in
 * `processing` (§ Payment reconciliation), on demand.
 *
 * The same `reconcileStuckIntents` the nightly cron runs — the only
 * difference is who starts it. That gap mattered: an STK push that
 * Safaricom accepts and then never calls back about leaves a customer
 * on a spinner and an operator with no way to find out why until 02:00.
 * Safaricom's STK Push Query knows the answer immediately; nothing
 * exposed it.
 *
 * `stuckAfterMs: 0` because a human pressing this button has already
 * decided the payment is worth asking about. The cron's own delay
 * exists so it does not query pushes that are simply mid-PIN-entry,
 * which is not a risk when someone is looking at the intent and
 * choosing to check it.
 *
 * Read-mostly: it can confirm a definitive failure and expire an
 * intent, but a confirmed success without a receipt number is handed to
 * a human rather than completed, exactly as the cron does. Pressing
 * this can never invent an order.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const outcomes = await paymentService.reconcileStuckIntents(session.businessId, { stuckAfterMs: 0 });

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'payment.reconcile_now',
    entityType: 'paymentIntent',
    entityId: 'batch',
    after: { checked: outcomes.length, outcomes: outcomes.map((o) => o.outcome) },
  });

  return Response.json({ checked: outcomes.length, outcomes });
}

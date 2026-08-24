import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { orderService } from '@/services/orderService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * `POST /api/admin/orders/{orderId}/send-confirmation-sms`
 * (§ manual confirmation SMS) — texts the customer their order
 * confirmation, when staff say so.
 *
 * An order recorded by hand no longer texts automatically: staff place
 * those while still with the customer, so a text firing the instant
 * they save is redundant at best. This is the deliberate send.
 *
 * Admin rather than super admin: sending a customer their own order
 * details is not the same weight as asserting money arrived, and the
 * staff member who took the order is the one standing there.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { orderId } = await params;
  const result = await orderService.sendConfirmationSms(session.businessId, orderId);

  if (!result.sent) {
    return Response.json({ error: result.reason ?? 'Could not send the confirmation text.' }, { status: 400 });
  }

  await recordAuditLog(request, {
    businessId: session.businessId,
    actorId: session.uid,
    action: 'order.send_confirmation_sms',
    entityType: 'order',
    entityId: orderId,
    after: { sent: true },
  });

  return Response.json({ sent: true });
}

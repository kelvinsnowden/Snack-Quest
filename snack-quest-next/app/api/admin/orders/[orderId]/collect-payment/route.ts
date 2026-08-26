import {
  hasStaffRole,
  ADMIN_OR_WAREHOUSE,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { paymentService } from '@/services/paymentService';
import { formatOrderNumber } from '@/lib/orders/format';

/**
 * Sends the M-Pesa prompt for an order the customer is paying for on
 * delivery (§ pay on delivery) — the button pressed at the door.
 *
 * Reachable by the Warehouse workspace as well as Admin, because the
 * person standing at the door with the box is the one who needs it.
 *
 * A *new* intent every time, carrying `orderId`. That field is what
 * routes the callback to settling this order instead of creating one
 * from its snapshot — the snapshot already became this order, and a
 * second creation attempt would be refused as already-completed, which
 * would mean the customer had paid and nothing was recorded.
 *
 * Pressing it twice is safe. Each press is its own prompt, and only
 * the first payment to arrive clears the outstanding flag; the second
 * finds nothing to settle and stops. The customer can therefore be
 * re-prompted freely when the first prompt times out on their phone,
 * which is the common case at a doorstep.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { orderId } = await params;
  const order = await orderRepository.findById(orderId);
  if (!order || order.businessId !== session.businessId) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }
  // Said plainly rather than as a generic conflict: a staff member
  // pressing this on an order somebody else already collected for
  // needs to know that is what happened.
  if (order.payment?.dueOnDelivery !== true) {
    return Response.json(
      { error: 'This order has already been paid for.' },
      { status: 409 },
    );
  }

  const intentId = await paymentService.createIntent({
    businessId: session.businessId,
    conversationId: order.conversationId,
    conversationCheckoutSnapshotId: order.conversationCheckoutSnapshotId,
    customerId: order.customer.customerId,
    phoneNumber: order.customer.phoneNumber,
    amountKes: order.pricing.totalKes,
    orderId,
  });

  const orderRef =
    order.orderNumber !== undefined ? formatOrderNumber(order.orderNumber) : orderId;

  try {
    await paymentService.initiateAttempt(session.businessId, intentId, {
      phone: order.customer.phoneNumber,
      amountKes: order.pricing.totalKes,
      accountReference: orderRef,
      transactionDesc: `Snack Quest ${orderRef}`,
    });
  } catch (error) {
    /*
     * The intent stays `pending` with nothing pushed against it, which
     * is harmless — it is the failed attempt, not a debt. Reported
     * rather than swallowed: somebody is standing at a door waiting
     * for a prompt that is not coming, and needs to know to try again.
     */
    await paymentIntentRepository.updateStatus(intentId, 'failed');
    return Response.json(
      {
        error:
          error instanceof Error
            ? `Could not send the prompt: ${error.message}`
            : 'Could not send the prompt. Try again.',
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, intentId, amountKes: order.pricing.totalKes });
}

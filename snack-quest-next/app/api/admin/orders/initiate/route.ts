import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  conversationService,
  WebCheckoutConflictError,
  WebCheckoutValidationError,
} from '@/services/conversationService';
import { InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import type { WebCheckoutRequest, WebCheckoutResponse } from '@/types/webCheckout';

/**
 * `POST /api/admin/orders/initiate` (§ staff-initiated orders) — a
 * staff member places an order on a customer's behalf and sends them
 * the M-Pesa prompt. For the order taken over the phone, at a stand,
 * or in an Instagram DM, where the customer isn't going to fill in a
 * checkout form themselves.
 *
 * It calls the same `startWebCheckout` the public website calls, with
 * the staff member recorded as the initiator. That is the whole point:
 * staff get a faster way to *start* an order, not a privileged way to
 * price one. The box price, the pickup fee, the referral discount and
 * the amount charged are computed exactly as they are for a customer
 * checking out themselves — there is no field here that could
 * discount, waive, or override anything.
 *
 * Authenticated by real staff session, and written to the audit log,
 * because this is the one action in the system where a staff member
 * causes money to be requested from a member of the public.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    packageId,
    quantity,
    customerName,
    phone,
    county,
    deliveryMethod,
    pickupStationId,
    addressText,
    estate,
    landmark,
    referralCode,
  } = (body ?? {}) as Partial<WebCheckoutRequest>;

  if (
    typeof packageId !== 'string' ||
    !packageId ||
    typeof customerName !== 'string' ||
    typeof phone !== 'string' ||
    typeof county !== 'string'
  ) {
    return Response.json(
      { error: 'packageId, customerName, phone and county are required' },
      { status: 400 },
    );
  }
  if (deliveryMethod !== 'pickup' && deliveryMethod !== 'door') {
    return Response.json({ error: "deliveryMethod must be 'pickup' or 'door'" }, { status: 400 });
  }
  if (typeof quantity !== 'number') {
    return Response.json({ error: 'quantity must be a number' }, { status: 400 });
  }

  try {
    const result = await conversationService.startWebCheckout(session.businessId, {
      packageId,
      quantity,
      customerName,
      phone,
      county,
      deliveryMethod,
      pickupStationId: typeof pickupStationId === 'string' ? pickupStationId : undefined,
      addressText: typeof addressText === 'string' ? addressText : undefined,
      estate: typeof estate === 'string' ? estate : undefined,
      landmark: typeof landmark === 'string' ? landmark : undefined,
      referralCode:
        typeof referralCode === 'string' && referralCode.trim() ? referralCode.trim() : undefined,
      initiatedBy: { staffUid: session.uid, staffName: session.displayName || session.email },
    });

    await auditLogRepository.record({
      businessId: session.businessId,
      actorId: session.uid,
      action: 'order.initiate',
      entityType: 'conversation',
      entityId: result.checkoutSessionId,
      // Nothing existed before this action, so `before` is genuinely
      // null rather than an empty object pretending to be a prior state.
      before: null,
      after: {
        phoneNumber: result.payingPhone,
        packageId,
        quantity: result.pricing.quantity,
        totalKes: result.pricing.totalKes,
        stkPushSent: result.stkPushSent,
      },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '',
    });

    const response: WebCheckoutResponse = {
      checkoutSessionId: result.checkoutSessionId,
      pricing: result.pricing,
      stkPushSent: result.stkPushSent,
      payingPhone: result.payingPhone,
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof WebCheckoutValidationError || error instanceof InvalidPhoneNumberError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof WebCheckoutConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

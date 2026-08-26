import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  conversationService,
  WebCheckoutConflictError,
  WebCheckoutValidationError,
} from '@/services/conversationService';
import { InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import type {
  WebCheckoutRequest,
  WebCheckoutResponse,
} from '@/types/webCheckout';
import type { ManualPaymentMethod } from '@/types';

const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = ['cash', 'mpesa_manual', 'bank_transfer'];

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
 *
 * `manualPayment` (§ super-admin manual payment orders) is the one
 * branch that does NOT request money: the customer already paid — cash
 * at a stand, an M-Pesa transfer they sent themselves, or a bank
 * transfer — and this records that fact instead of pushing an STK
 * prompt. It is restricted to super admins, above the `ADMIN_ONLY`
 * gate the rest of this route uses, because it is the only way to
 * create a paid order in this system without a provider callback
 * proving the money moved. It still cannot change what an order costs:
 * there is no amount field, and pricing runs through exactly the same
 * code as every other checkout.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
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
    guaranteedSnackIds,
    items,
  } = (body ?? {}) as Partial<WebCheckoutRequest>;

  /*
   * The customer settles delivery with the courier (§ delivery paid on
   * delivery). Read off the raw body rather than `WebCheckoutRequest`,
   * because it is not something a customer's own checkout may ask for
   * — the service ignores it unless the order is staff-initiated, and
   * this route is the only caller that sets `initiatedBy`.
   */
  const deliveryFeeOnDelivery = (body as { deliveryFeeOnDelivery?: unknown } | null)?.deliveryFeeOnDelivery === true;

  const rawManualPayment = (body as { manualPayment?: unknown } | null)?.manualPayment;
  let manualPayment:
    | { method: ManualPaymentMethod; reference: string | null; recordedByUid: string; recordedByName: string; note: string | null }
    | undefined;

  if (rawManualPayment !== undefined && rawManualPayment !== null) {
    if (!isSuperAdmin(session)) {
      return Response.json(
        { error: 'Only a super admin can record an order as already paid.' },
        { status: 403 },
      );
    }
    const { method, reference, note } = rawManualPayment as {
      method?: unknown;
      reference?: unknown;
      note?: unknown;
    };
    if (typeof method !== 'string' || !MANUAL_PAYMENT_METHODS.includes(method as ManualPaymentMethod)) {
      return Response.json(
        { error: `manualPayment.method must be one of: ${MANUAL_PAYMENT_METHODS.join(', ')}` },
        { status: 400 },
      );
    }
    const trimmedReference = typeof reference === 'string' ? reference.trim() : '';
    // Cash is the only method with genuinely nothing to reference. For
    // the other two the reference is the only artifact tying this
    // assertion to money that actually moved, so it is required.
    if (method !== 'cash' && !trimmedReference) {
      return Response.json(
        { error: 'A payment reference is required for an M-Pesa or bank transfer.' },
        { status: 400 },
      );
    }
    manualPayment = {
      method: method as ManualPaymentMethod,
      reference: trimmedReference || null,
      // Always the authenticated session, never anything the body
      // claims — this field is the accountability record.
      recordedByUid: session.uid,
      recordedByName: session.displayName || session.email,
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
    };
  }

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
    return Response.json(
      { error: "deliveryMethod must be 'pickup' or 'door'" },
      { status: 400 },
    );
  }
  if (typeof quantity !== 'number') {
    return Response.json(
      { error: 'quantity must be a number' },
      { status: 400 },
    );
  }

  try {
    const result = await conversationService.startWebCheckout(
      session.businessId,
      {
        packageId,
        quantity,
        customerName,
        phone,
        county,
        deliveryMethod,
        pickupStationId:
          typeof pickupStationId === 'string' ? pickupStationId : undefined,
        addressText: typeof addressText === 'string' ? addressText : undefined,
        estate: typeof estate === 'string' ? estate : undefined,
        landmark: typeof landmark === 'string' ? landmark : undefined,
        referralCode:
          typeof referralCode === 'string' && referralCode.trim()
            ? referralCode.trim()
            : undefined,
        /*
         * The snacks a staff member picked for a box that offers them
         * (§ staff pick the snacks too). Passed straight through, and
         * only when it is genuinely a list of strings — everything
         * that decides whether these are *acceptable* lives in
         * `validateGuaranteedPicks`, which re-reads the live catalogue
         * and refuses the wrong count, a duplicate, a snack no admin
         * opted in, one out of stock, or one belonging to another
         * business.
         *
         * Staff go through that same check rather than around it. They
         * are trusted to take an order, not to put a snack in a box
         * that does not exist or has run out — and a picker showing a
         * stale list is exactly how that would otherwise happen.
         */
        // Every box a staff member put on the order. Validated by the
        // service against the live catalogue, exactly as a customer's
        // own checkout is.
        ...(Array.isArray(items) ? { items } : {}),
        ...(deliveryFeeOnDelivery ? { deliveryFeeOnDelivery: true } : {}),
        guaranteedSnackIds: Array.isArray(guaranteedSnackIds)
          ? guaranteedSnackIds.filter((id): id is string => typeof id === 'string')
          : undefined,
        initiatedBy: {
          staffUid: session.uid,
          staffName: session.displayName || session.email,
        },
        ...(manualPayment ? { manualPayment } : {}),
      },
    );

    await auditLogRepository.record({
      businessId: session.businessId,
      actorId: session.uid,
      action: manualPayment ? 'order.initiate_already_paid' : 'order.initiate',
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
        ...(manualPayment
          ? {
              manualPaymentMethod: manualPayment.method,
              manualPaymentReference: manualPayment.reference,
              manualPaymentNote: manualPayment.note,
            }
          : {}),
      },
      ipAddress:
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '',
    });

    const response: WebCheckoutResponse = {
      checkoutSessionId: result.checkoutSessionId,
      pricing: result.pricing,
      stkPushSent: result.stkPushSent,
      payingPhone: result.payingPhone,
    };
    return Response.json(response);
  } catch (error) {
    if (
      error instanceof WebCheckoutValidationError ||
      error instanceof InvalidPhoneNumberError
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof WebCheckoutConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

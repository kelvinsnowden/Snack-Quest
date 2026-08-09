import {
  conversationService,
  WebCheckoutConflictError,
  WebCheckoutValidationError,
} from '@/services/conversationService';
import { InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import type { WebCheckoutRequest, WebCheckoutResponse } from '@/types/webCheckout';

/**
 * `POST /api/checkout/web` (§ Website Becomes the Primary Commerce
 * Channel) — the website's one purchase endpoint. Unauthenticated by
 * design: this is a public storefront, the same way tapping a product
 * in WhatsApp is. What keeps it safe is that it accepts no money
 * values at all — the client sends which box, how many, and where to,
 * and every figure comes back computed from `packages` and
 * `pickupStations`.
 *
 * Deliberately thin: parsing and narrowing only. Validation, pricing,
 * the snapshot freeze and the STK push all live in
 * `ConversationService.startWebCheckout`, which is the same code the
 * WhatsApp path runs — there is no second pricing implementation here
 * to drift out of sync.
 */
export async function POST(request: Request): Promise<Response> {
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
    contactPhone,
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

  const businessId = getCurrentBusinessId();

  try {
    const result = await conversationService.startWebCheckout(businessId, {
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
      contactPhone: typeof contactPhone === 'string' ? contactPhone : undefined,
      referralCode: typeof referralCode === 'string' && referralCode.trim() ? referralCode.trim() : undefined,
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

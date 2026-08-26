import { parseCookie } from 'cookie';
import {
  conversationService,
  WebCheckoutConflictError,
  WebCheckoutValidationError,
} from '@/services/conversationService';
import { InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { FBCLID_COOKIE, TTCLID_COOKIE } from '@/lib/analytics/cookies';
import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import type { WebCheckoutRequest, WebCheckoutResponse } from '@/types/webCheckout';
import type { ConversionAttribution } from '@/types';

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
    items,
    customerName,
    phone,
    email,
    county,
    deliveryMethod,
    serviceLevel,
    pickupStationId,
    addressText,
    estate,
    landmark,
    contactPhone,
    referralCode,
    guaranteedSnackIds,
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

  // Captured here, not later — order confirmation itself happens off
  // an async Daraja webhook with no browser context at all (§ close
  // the loop: ad-conversion attribution). This is the one moment this
  // app has real cookies/headers to attribute the eventual order with.
  const cookieHeader = request.headers.get('cookie');
  const cookies = cookieHeader ? parseCookie(cookieHeader) : {};
  /*
   * Absent keys, not keys set to `undefined`.
   *
   * `ttclid: cookies[TTCLID_COOKIE]` looks equivalent, and in
   * TypeScript it is — the field is declared `ttclid?: string`, so
   * undefined means absent. Firestore disagrees: it rejects a document
   * containing an undefined value outright, so a visitor who arrived
   * without a TikTok or Facebook click cookie — which is nearly all of
   * them — took down the entire checkout with
   * "Cannot use undefined as a Firestore value".
   */
  const referer = request.headers.get('referer');
  const ttclid = cookies[TTCLID_COOKIE];
  const fbclid = cookies[FBCLID_COOKIE];
  const attribution: ConversionAttribution = {
    channel: 'web',
    ...(referer ? { landingUrl: referer } : {}),
    ...(ttclid ? { ttclid } : {}),
    ...(fbclid ? { fbclid } : {}),
  };

  // The creator discount (§ Creator-Only Offers) is derived from the
  // real session cookie, never from anything the request body claims —
  // a customer who isn't signed in as a creator simply has no such
  // cookie to verify.
  const creatorSession = await verifyCreatorSessionFromRequest(request);

  try {
    const result = await conversationService.startWebCheckout(businessId, {
      packageId,
      quantity,
      /*
       * Every box on the order (§ more than one box per order).
       * Forwarded only when it is genuinely a list — the service
       * re-reads each box from the catalogue and refuses a duplicate,
       * an unavailable box, or a bad count, so nothing here needs to
       * decide whether the contents are acceptable.
       */
      ...(Array.isArray(items) ? { items: items as { packageId: string; quantity: number }[] } : {}),
      customerName,
      phone,
      // Normalized (or dropped) in the Service, which is where every
      // other field is validated — the route stays parsing only.
      email: typeof email === 'string' ? email : undefined,
      county,
      deliveryMethod,
      serviceLevel: serviceLevel === 'same-day' ? 'same-day' : undefined,
      pickupStationId: typeof pickupStationId === 'string' ? pickupStationId : undefined,
      addressText: typeof addressText === 'string' ? addressText : undefined,
      estate: typeof estate === 'string' ? estate : undefined,
      landmark: typeof landmark === 'string' ? landmark : undefined,
      contactPhone: typeof contactPhone === 'string' ? contactPhone : undefined,
      referralCode: typeof referralCode === 'string' && referralCode.trim() ? referralCode.trim() : undefined,
      // Ids only, and only strings — the service re-reads every one of
      // them from the catalogue before anything reaches an order.
      guaranteedSnackIds: Array.isArray(guaranteedSnackIds)
        ? guaranteedSnackIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
      isCreatorCheckout: Boolean(creatorSession),
      creatorUid: creatorSession?.uid ?? null,
      attribution,
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

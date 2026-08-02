import { businessRepository } from '@/repositories/businessRepository';
import { conversationService } from '@/services/conversationService';
import { productService, ProductNotFoundError, ProductNotAvailableError } from '@/services/productService';
import type { CheckoutStartRequest, CheckoutStartResponse } from '@/types/checkout';

/**
 * `POST /checkout/start` (§ Product Catalog & Checkout Architecture):
 * the moment a customer taps a product inside Whatchimp's own Product
 * Catalog UI. Whatchimp never assumes the catalog price it displayed
 * is final — it calls this route with just the product identifier,
 * and Snack Quest OS is the one that validates the product, prices
 * it authoritatively, applies attribution, and decides what happens
 * next. No STK push is possible from this path — that only ever
 * happens from `/checkout/pay`, after the customer's own PAY reply.
 *
 * Same honest gap as `app/api/internal/conversations/[conversationId]/price-door-delivery/route.ts`:
 * this codebase has no real BSP/staff authentication yet, so a shared
 * secret header is a stopgap, not a replacement for verifying
 * Whatchimp's own request signing (undocumented, since no real
 * Whatchimp docs exist — see WhatchimpGateway's class doc comment).
 */
export async function POST(request: Request): Promise<Response> {
  const expectedKey = process.env.WHATCHIMP_CHECKOUT_API_KEY;
  const providedKey = request.headers.get('x-checkout-api-key');
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { phoneNumberId, customerPhone, productId, quantity, referralCode, creatorAttributionId } =
    (body ?? {}) as Partial<CheckoutStartRequest>;

  if (
    typeof phoneNumberId !== 'string' ||
    !phoneNumberId ||
    typeof customerPhone !== 'string' ||
    !customerPhone ||
    typeof productId !== 'string' ||
    !productId
  ) {
    return Response.json(
      { error: 'body must include non-empty string phoneNumberId, customerPhone, and productId' },
      { status: 400 },
    );
  }
  if (quantity !== undefined && quantity !== 1) {
    return Response.json(
      { error: 'this catalog only supports a single unit per checkout — quantity must be 1' },
      { status: 400 },
    );
  }

  const business = await businessRepository.findByWhatsappPhoneNumberId(phoneNumberId);
  if (!business) {
    return Response.json({ error: `no business owns WhatsApp number ${phoneNumberId}` }, { status: 404 });
  }
  const businessId = business.id;

  let product;
  try {
    product = await productService.getCheckoutableProduct(businessId, productId);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ProductNotAvailableError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  try {
    const { conversationId, nextStep, botReply } = await conversationService.startFromCatalogSelection(
      businessId,
      customerPhone,
      { id: productId, name: product.name, priceKes: product.priceKes },
      {
        referralLinkId: creatorAttributionId ?? null,
        referralCode: referralCode ?? null,
      },
    );

    const response: CheckoutStartResponse = {
      checkoutSessionId: conversationId,
      nextStep,
      product: { id: productId, name: product.name, priceKes: product.priceKes },
      message: botReply,
    };
    return Response.json(response);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'unknown error' },
      { status: 400 },
    );
  }
}

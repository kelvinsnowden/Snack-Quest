import { businessRepository } from '@/repositories/businessRepository';
import { conversationService } from '@/services/conversationService';
import { productService, ProductNotFoundError, ProductNotAvailableError } from '@/services/productService';
import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';
import type { SelectProductRequest, SelectProductResponse } from '@/types/whatchimpBridge';

/**
 * `POST /api/whatchimp/select-product` (§ WhatChimp Integration
 * Redesign) — the Bridge API's equivalent of `/checkout/start`, called
 * from a WhatChimp flow step instead of a free-text/legacy catalog
 * entry point. Same pricing-authority rule: Snack Quest OS validates
 * and re-prices the product, never trusts anything the request claims
 * about it. Silent — returns structured fields for WhatChimp's own
 * Response Mapping, never sends a WhatsApp message itself.
 */
export async function POST(request: Request): Promise<Response> {
  if (!verifyWhatchimpBridgeRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { phoneNumberId, customerPhone, productId, referralCode, creatorAttributionId } =
    (body ?? {}) as Partial<SelectProductRequest>;

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
    const { conversationId, nextStep } = await conversationService.bridgeSelectProduct(
      businessId,
      customerPhone,
      { id: productId, name: product.name, priceKes: product.priceKes },
      { referralLinkId: creatorAttributionId ?? null, referralCode: referralCode ?? null },
    );

    const response: SelectProductResponse = {
      checkoutSessionId: conversationId,
      nextStep,
      productId,
      productName: product.name,
      priceKes: product.priceKes,
    };
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 400 });
  }
}

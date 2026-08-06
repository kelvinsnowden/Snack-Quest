import { NextRequest } from 'next/server';
import { businessRepository } from '@/repositories/businessRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { productService, ProductNotAvailableError, ProductNotFoundError } from '@/services/productService';
import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { conversationRepository } from '@/repositories/conversationRepository';

function businessId(): string {
  const value = process.env.PUBLIC_CHECKOUT_BUSINESS_ID;
  if (!value) throw new Error('PUBLIC_CHECKOUT_BUSINESS_ID is not configured');
  return value;
}

function errorResponse(error: unknown): Response {
  if (error instanceof ConversationNotFoundError || error instanceof ProductNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ProductNotAvailableError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return Response.json({ error: error instanceof Error ? error.message : 'Unable to process checkout' }, { status: 400 });
}

/** Public website adapter. It orchestrates the established ConversationService;
 * it contains no pricing, stock, referral, order, or payment logic. */
export async function GET(): Promise<Response> {
  try {
    const id = businessId();
    const business = await businessRepository.findById(id);
    if (!business || business.status !== 'active') return Response.json({ error: 'Checkout is unavailable' }, { status: 404 });
    const packages = await packageRepository.listActive(id);
    return Response.json({
      business: { name: business.name, currency: business.currency },
      products: packages.map(({ id: productId, data }) => ({
        id: productId, name: data.name, description: data.description, imageUrl: data.imageUrl, priceKes: data.priceKes,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const id = businessId();

    if (action === 'start') {
      const { phoneNumber, productId, quantity, referralCode } = body;
      if (typeof phoneNumber !== 'string' || typeof productId !== 'string' || !Number.isInteger(quantity) || (quantity as number) < 1) {
        return Response.json({ error: 'phoneNumber, productId, and a positive integer quantity are required' }, { status: 400 });
      }
      const product = await productService.getCheckoutableProduct(id, productId);
      const result = await conversationService.bridgeSelectProduct(id, phoneNumber, { id: productId, name: product.name, priceKes: product.priceKes }, {
        referralCode: typeof referralCode === 'string' ? referralCode : null,
        quantity: quantity as number,
      });
      return Response.json({ checkoutSessionId: result.conversationId, priceKes: product.priceKes });
    }

    const checkoutSessionId = body.checkoutSessionId;
    if (typeof checkoutSessionId !== 'string' || !checkoutSessionId) {
      return Response.json({ error: 'checkoutSessionId is required' }, { status: 400 });
    }

    if (action === 'delivery') {
      const { customerName, county, deliveryMethod, pickupStationId, pickupStationSearch, addressText, landmark, estate, contactPhone } = body;
      if (typeof customerName !== 'string' || typeof county !== 'string') return Response.json({ error: 'customerName and county are required' }, { status: 400 });
      return Response.json(await conversationService.bridgeProvideDeliveryDetails(id, checkoutSessionId, {
        customerName, county, deliveryMethod: deliveryMethod === 'door' || deliveryMethod === 'pickup' ? deliveryMethod : undefined,
        pickupStationId: typeof pickupStationId === 'string' ? pickupStationId : undefined,
        pickupStationSearch: typeof pickupStationSearch === 'string' ? pickupStationSearch : undefined,
        addressText: typeof addressText === 'string' ? addressText : undefined,
        landmark: typeof landmark === 'string' ? landmark : undefined,
        estate: typeof estate === 'string' ? estate : undefined,
        contactPhone: typeof contactPhone === 'string' ? contactPhone : undefined,
      }));
    }

    if (action === 'referral') {
      return Response.json(await conversationService.bridgeApplyReferral(id, checkoutSessionId, typeof body.referralCode === 'string' && body.referralCode.trim() ? body.referralCode : null));
    }

    if (action === 'pay') return Response.json(await conversationService.bridgeCheckout(id, checkoutSessionId));

    if (action === 'status') {
      const conversation = await conversationRepository.findById(checkoutSessionId);
      if (!conversation || conversation.businessId !== id) return Response.json({ error: 'Checkout session not found' }, { status: 404 });
      return Response.json(await conversationService.getOrderStatus(id, checkoutSessionId));
    }

    return Response.json({ error: 'Unknown checkout action' }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';
import type { QuoteDeliveryRequest } from '@/types/whatchimpBridge';

/**
 * `POST /api/whatchimp/quote-delivery` (§ WhatChimp Integration
 * Redesign) — the Bridge API's structured replacement for the
 * free-text `awaiting_customer_details` through
 * `awaiting_pickup_station_selection`/`awaiting_door_delivery_details`
 * steps. See `ConversationService.bridgeProvideDeliveryDetails` for
 * the three call shapes this dispatches to (search, select a station,
 * or escalate a door-delivery order to a human agent).
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

  const {
    checkoutSessionId,
    customerName,
    county,
    deliveryMethod,
    pickupStationId,
    pickupStationSearch,
    addressText,
    landmark,
    estate,
    contactPhone,
  } = (body ?? {}) as Partial<QuoteDeliveryRequest>;

  if (
    typeof checkoutSessionId !== 'string' ||
    !checkoutSessionId ||
    typeof customerName !== 'string' ||
    !customerName ||
    typeof county !== 'string' ||
    !county
  ) {
    return Response.json(
      { error: 'body must include non-empty string checkoutSessionId, customerName, and county' },
      { status: 400 },
    );
  }
  if (deliveryMethod !== undefined && deliveryMethod !== 'pickup' && deliveryMethod !== 'door') {
    return Response.json({ error: '"deliveryMethod" must be "pickup" or "door" if provided' }, { status: 400 });
  }

  const conversation = await conversationRepository.findById(checkoutSessionId);
  if (!conversation) {
    return Response.json({ error: `checkout session ${checkoutSessionId} not found` }, { status: 404 });
  }

  try {
    const response = await conversationService.bridgeProvideDeliveryDetails(
      conversation.businessId,
      checkoutSessionId,
      { customerName, county, deliveryMethod, pickupStationId, pickupStationSearch, addressText, landmark, estate, contactPhone },
    );
    return Response.json(response);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 400 });
  }
}

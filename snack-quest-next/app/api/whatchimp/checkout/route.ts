import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';
import type { WhatchimpCheckoutRequest } from '@/types/whatchimpBridge';

/**
 * `POST /api/whatchimp/checkout` (§ WhatChimp Integration Redesign) —
 * the Bridge API's equivalent of `/checkout/pay`: the wire for a
 * customer's explicit "pay now" moment inside a WhatChimp flow. Unlike
 * `/checkout/pay` (which fakes a `text: 'PAY'` message through the
 * free-text engine, causing it to send a WhatsApp reply as a side
 * effect), this calls `bridgeCheckout` directly — same price/fee
 * revalidation, same Daraja STK push, but silent: WhatChimp's own flow
 * renders "prompt sent" from this response, so our backend never sends
 * a message here.
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

  const { checkoutSessionId } = (body ?? {}) as Partial<WhatchimpCheckoutRequest>;
  if (typeof checkoutSessionId !== 'string' || !checkoutSessionId) {
    return Response.json({ error: 'body must include a non-empty string checkoutSessionId' }, { status: 400 });
  }

  const conversation = await conversationRepository.findById(checkoutSessionId);
  if (!conversation) {
    return Response.json({ error: `checkout session ${checkoutSessionId} not found` }, { status: 404 });
  }

  try {
    const response = await conversationService.bridgeCheckout(conversation.businessId, checkoutSessionId);
    return Response.json(response);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

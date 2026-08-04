import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';

/**
 * `GET /api/whatchimp/order-status?checkoutSessionId=...` (§ WhatChimp
 * Integration Redesign) — the poll endpoint a WhatChimp Follow-up
 * Sequence (or a customer-triggered "check status" action) calls after
 * `/api/whatchimp/checkout` returns `stk_sent`, since nothing pushes
 * the real Daraja result back into the conversation on its own
 * schedule (§ the migration plan's async gap). Read-only — see
 * `ConversationService.getOrderStatus` for exactly what each
 * `paymentStatus` value means.
 */
export async function GET(request: Request): Promise<Response> {
  if (!verifyWhatchimpBridgeRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const checkoutSessionId = new URL(request.url).searchParams.get('checkoutSessionId');
  if (!checkoutSessionId) {
    return Response.json({ error: 'checkoutSessionId query parameter is required' }, { status: 400 });
  }

  const conversation = await conversationRepository.findById(checkoutSessionId);
  if (!conversation) {
    return Response.json({ error: `checkout session ${checkoutSessionId} not found` }, { status: 404 });
  }

  try {
    const response = await conversationService.getOrderStatus(conversation.businessId, checkoutSessionId);
    return Response.json(response);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

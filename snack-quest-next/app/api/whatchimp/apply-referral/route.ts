import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';
import type { ApplyReferralRequest } from '@/types/whatchimpBridge';

/**
 * `POST /api/whatchimp/apply-referral` (§ WhatChimp Integration
 * Redesign) — the Bridge API's structured replacement for the
 * free-text `awaiting_referral_code` step. See
 * `ConversationService.bridgeApplyReferral` for the validation rule:
 * an invalid/missing code never blocks checkout, it just previews a
 * KES 0 discount.
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

  const { checkoutSessionId, referralCode } = (body ?? {}) as Partial<ApplyReferralRequest>;
  if (typeof checkoutSessionId !== 'string' || !checkoutSessionId) {
    return Response.json({ error: 'body must include a non-empty string checkoutSessionId' }, { status: 400 });
  }

  const conversation = await conversationRepository.findById(checkoutSessionId);
  if (!conversation) {
    return Response.json({ error: `checkout session ${checkoutSessionId} not found` }, { status: 404 });
  }

  try {
    const response = await conversationService.bridgeApplyReferral(
      conversation.businessId,
      checkoutSessionId,
      referralCode ?? null,
    );
    return Response.json(response);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

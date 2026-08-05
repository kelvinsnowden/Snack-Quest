import { businessRepository } from '@/repositories/businessRepository';
import { processConversationTurn } from '@/services/conversationTurnService';
import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';

interface WhatchimpTurnRequest {
  phoneNumberId: string;
  customerPhone: string;
  text: string;
  providerMessageId?: string | null;
}

/**
 * `POST /api/whatchimp/turn` (§ WhatChimp Integration Redesign, Phase
 * 2 — replaces the per-checkpoint Bridge endpoints as the thing
 * WhatChimp's Flow Builder actually calls) — the one HTTP API block
 * every turn of the flow needs, full stop. WhatChimp's Flow Builder
 * cannot branch on a button/list reply or attach an HTTP call to one,
 * only forward whatever the customer sent via an unconditional `Next`
 * step, so all five original checkpoint endpoints (`select-product`,
 * `quote-delivery`, `apply-referral`, `checkout`, kept for backward
 * compatibility — see their own route files) assumed a routing
 * capability the platform doesn't actually have. This route resolves
 * WhatChimp's `phoneNumberId` into a `businessId` and hands off to the
 * exact same channel-agnostic engine `POST /api/conversations/turn`
 * exposes directly — the only WhatChimp-specific thing left is this
 * one identity-resolution step.
 *
 * Flow shape this is designed for: [any inbound message] → `Next` →
 * this endpoint → Send Message, body = `{{messageText}}`. Every
 * customer choice (box, delivery method, referral code, "PAY") is an
 * ordinary typed/tapped-as-text reply the engine interprets by
 * conversation step — never a button action wired to this route.
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

  const { phoneNumberId, customerPhone, text, providerMessageId } = (body ?? {}) as Partial<WhatchimpTurnRequest>;

  if (
    typeof phoneNumberId !== 'string' ||
    !phoneNumberId ||
    typeof customerPhone !== 'string' ||
    !customerPhone ||
    typeof text !== 'string' ||
    !text
  ) {
    return Response.json(
      { error: 'body must include non-empty string phoneNumberId, customerPhone, and text' },
      { status: 400 },
    );
  }

  const business = await businessRepository.findByWhatsappPhoneNumberId(phoneNumberId);
  if (!business) {
    return Response.json({ error: `no business owns WhatsApp number ${phoneNumberId}` }, { status: 404 });
  }

  try {
    const result = await processConversationTurn({
      businessId: business.id,
      channel: 'whatsapp',
      externalUserId: customerPhone,
      text,
      providerMessageId: typeof providerMessageId === 'string' ? providerMessageId : null,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 400 });
  }
}

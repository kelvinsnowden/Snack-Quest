import { verifyWhatchimpBridgeRequest } from '@/lib/webhooks/whatchimpBridgeAuth';
import { processConversationTurn } from '@/services/conversationTurnService';
import type { ConversationTurnInput } from '@/types/conversationTurn';

const VALID_CHANNELS = ['whatsapp'];

/**
 * `POST /api/conversations/turn` (§ WhatChimp Integration Redesign,
 * Phase 2) — the channel-agnostic conversation engine's one entry
 * point. Takes raw customer text plus an already-resolved
 * `businessId`, runs the full state machine, and returns whatever
 * should be shown back — nothing about this route is WhatsApp- or
 * WhatChimp-specific, so a future website widget, mobile app, or
 * Instagram handler calls it exactly the same way, each resolving its
 * own `businessId`/`externalUserId` first. `POST /api/whatchimp/turn`
 * is the thin WhatChimp-specific adapter in front of this same engine
 * — see its own doc comment for why a separate route exists at all.
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

  const { businessId, channel, externalUserId, text, providerMessageId } = (body ?? {}) as Partial<ConversationTurnInput>;

  if (
    typeof businessId !== 'string' ||
    !businessId ||
    typeof channel !== 'string' ||
    !VALID_CHANNELS.includes(channel) ||
    typeof externalUserId !== 'string' ||
    !externalUserId ||
    typeof text !== 'string' ||
    !text
  ) {
    return Response.json(
      { error: `body must include non-empty string businessId, externalUserId, text, and channel (one of: ${VALID_CHANNELS.join(', ')})` },
      { status: 400 },
    );
  }

  try {
    const result = await processConversationTurn({
      businessId,
      channel: channel as ConversationTurnInput['channel'],
      externalUserId,
      text,
      providerMessageId: typeof providerMessageId === 'string' ? providerMessageId : null,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 400 });
  }
}

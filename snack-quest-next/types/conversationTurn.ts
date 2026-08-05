import type { ConversationStep } from './conversation';

/**
 * The channel-agnostic conversation engine's request/response contract
 * (§ WhatChimp Integration Redesign, Phase 2 — the universal turn
 * endpoint). This is the shape the *engine* speaks — no phone numbers,
 * no WhatChimp field names. Today only WhatsApp (via WhatChimp) calls
 * it; a website widget, a future mobile app, or an Instagram DM
 * handler would call the exact same contract later, each resolving
 * its own `businessId`/`externalUserId` from whatever identity its
 * channel actually has, then handing off here.
 */
export type ConversationChannel = 'whatsapp';

export interface ConversationTurnInput {
  businessId: string;
  channel: ConversationChannel;
  /** The customer's identity on this channel — a phone number for WhatsApp; a session/user id for a future web widget. */
  externalUserId: string;
  text: string;
  /** The channel's own message id, if it has one — best-effort future idempotency hook, not required. */
  providerMessageId?: string | null;
}

export interface ConversationTurnOutput {
  conversationId: string;
  nextStep: ConversationStep;
  /**
   * Every customer-facing message the engine produced this turn, in
   * order — a single turn can produce more than one (e.g. a wallet
   * credit notice followed by the STK push confirmation). Render each
   * as its own message if the calling channel can do that.
   */
  messages: string[];
  /** `messages.join('\n\n')` — for a caller that can only render one message per turn (e.g. one Send Message block). */
  messageText: string;
}

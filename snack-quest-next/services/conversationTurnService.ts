import 'server-only';

import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { conversationRepository } from '@/repositories/conversationRepository';
import { ConversationService, type ConversationOutputSink } from './conversationService';
import type { WhatsAppGateway } from '@/lib/integrations/types';
import type { ConversationTurnInput, ConversationTurnOutput } from '@/types/conversationTurn';

/**
 * Captures every customer-facing reply instead of sending it — the
 * calling channel (a WhatChimp Flow's Send Message block today; a
 * website widget or another channel's own renderer later) owns
 * actually delivering it, since none of them can be trusted to relay
 * *and* branch on a customer's reply the way a raw WhatsApp webhook
 * could (§ WhatChimp Integration Redesign, Phase 2 — WhatChimp's Flow
 * Builder specifically cannot route on a button/list reply or attach
 * an HTTP call to one).
 */
class CapturingOutputSink implements ConversationOutputSink {
  readonly messages: string[] = [];
  private counter = 0;

  async send(input: { text: string }): Promise<{ providerMessageId: string }> {
    this.messages.push(input.text);
    this.counter += 1;
    return { providerMessageId: `silent:${Date.now()}:${this.counter}` };
  }
}

/**
 * The channel-agnostic conversation engine (§ WhatChimp Integration
 * Redesign, Phase 2) — every business rule and every step of
 * conversational state lives here and nowhere else. Reuses
 * `ConversationService.start()` (the exact state machine the original
 * raw-webhook journey already runs) unchanged; the only difference is
 * that customer-facing replies are captured via a `CapturingOutputSink`
 * instead of sent through a live Gateway, because the caller is going
 * to render them itself. Admin notifications and BSP inbox sync
 * (`assignHumanAgent`/`updateConversationStatus`) still go out for
 * real — see `ConversationService`'s constructor doc comment.
 *
 * `gateway` is injectable (defaults to the real `whatchimpGateway`) so
 * tests can supply a fake without any live network calls, the same
 * pattern `ConversationService` itself already uses.
 */
export function createConversationTurnProcessor(gateway: WhatsAppGateway = whatchimpGateway) {
  return async function processConversationTurn(
    input: ConversationTurnInput,
  ): Promise<ConversationTurnOutput> {
    const sink = new CapturingOutputSink();
    const service = new ConversationService(gateway, sink);

    const result = await service.start(input.businessId, input.externalUserId, {
      text: input.text,
      providerMessageId: input.providerMessageId ?? undefined,
    });

    const conversation = await conversationRepository.findById(result.conversationId);

    return {
      conversationId: result.conversationId,
      nextStep: conversation?.currentStep ?? 'started',
      messages: sink.messages,
      messageText: sink.messages.join('\n\n'),
    };
  };
}

export const processConversationTurn = createConversationTurnProcessor();

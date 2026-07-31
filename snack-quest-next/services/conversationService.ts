import 'server-only';

import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { paymentService, type ProcessCallbackResult } from './paymentService';
import { publishEvent } from '@/lib/events/eventBus';
import {
  startConversationMessages,
  transition,
  type PackageOption,
} from '@/lib/conversation/stateMachine';
import type { WhatsAppGateway } from '@/lib/integrations/types';
import type { ConversationStateBlob } from '@/types';

/**
 * Owns the conversation lifecycle (PLATFORM_ARCHITECTURE_V2.md §6):
 * find-or-create, turn-by-turn state machine transitions, and the
 * hand-off into Payment once an order is confirmed. This is the
 * *only* place inbound WhatsApp messages get processed — the webhook
 * route does nothing but parse the provider payload and call `start()`.
 *
 * Deliberate, documented simplifications for this milestone (not
 * silently assumed correct — each is a named follow-up):
 * - Customer identification always proceeds as guest (`customerId:
 *   null`) — `CustomerRepository.findByPhone()` doesn't exist yet.
 * - Referral codes are captured into `stateBlob` but never validated
 *   and never produce a discount — Referral Domain (Milestone 6).
 * - `shippingKes` is always 0 — Delivery Domain's fee calculation
 *   (Milestone 5) isn't wired yet.
 */

async function getAvailablePackages(): Promise<PackageOption[]> {
  const packages = await packageRepository.listActive();
  return packages.map(({ id, data }) => ({
    id,
    name: data.name,
    priceKes: data.priceKes,
  }));
}

function isNairobiCounty(county: string | undefined): boolean {
  return (county ?? '').toLowerCase().includes('nairobi');
}

export interface InboundMessage {
  text: string;
  providerMessageId?: string;
}

export interface StartOptions {
  referralLinkId?: string | null;
  attributionSnapshot?: Record<string, unknown> | null;
}

export interface ConversationTurnResult {
  conversationId: string;
  botReply: string | null;
}

class ConversationService {
  constructor(private readonly gateway: WhatsAppGateway = whatchimpGateway) {}

  /**
   * The single entry point for every inbound WhatsApp message
   * (§6: "Creates or resumes a conversations document keyed by phone
   * number"). Handles first-contact welcome, mid-flow state
   * transitions, and human-takeover pausing, all in one place so
   * there is exactly one path an inbound message can take.
   */
  async start(
    phoneNumber: string,
    inboundMessage: InboundMessage,
    options: StartOptions = {},
  ): Promise<ConversationTurnResult> {
    const existing = await conversationRepository.findActiveByPhoneNumber(phoneNumber);

    let conversationId: string;
    const isNewConversation = !existing;

    if (existing) {
      conversationId = existing.id;
    } else {
      conversationId = await conversationRepository.create({ phoneNumber, ...options });
      await publishEvent('ConversationStarted', 'conversation', conversationId, {
        phoneNumber,
      });
    }

    await conversationRepository.appendMessage(conversationId, {
      direction: 'inbound',
      body: inboundMessage.text,
      providerMessageId: inboundMessage.providerMessageId ?? null,
    });

    if (existing?.conversation.status === 'agent_assigned') {
      // Human takeover (§6): log the message, generate no bot reply.
      return { conversationId, botReply: null };
    }

    if (isNewConversation) {
      return this.sendWelcome(conversationId, phoneNumber);
    }

    return this.processTurn(
      conversationId,
      phoneNumber,
      existing!.conversation.currentStep,
      existing!.conversation.stateBlob,
      inboundMessage.text,
    );
  }

  private async sendWelcome(
    conversationId: string,
    phoneNumber: string,
  ): Promise<ConversationTurnResult> {
    const availablePackages = await getAvailablePackages();
    const { nextStep, botReply } = startConversationMessages(availablePackages);
    await conversationRepository.updateStep(conversationId, nextStep);
    await this.reply(conversationId, phoneNumber, botReply);
    return { conversationId, botReply };
  }

  private async processTurn(
    conversationId: string,
    phoneNumber: string,
    currentStep: import('@/types').ConversationStep,
    stateBlob: ConversationStateBlob,
    inboundText: string,
  ): Promise<ConversationTurnResult> {
    const availablePackages = await getAvailablePackages();
    const result = transition({
      currentStep,
      stateBlob,
      inboundText,
      context: { availablePackages, isNairobi: isNairobiCounty(stateBlob.county) },
    });

    await conversationRepository.updateStep(
      conversationId,
      result.nextStep,
      result.stateBlobPatch,
    );
    await this.reply(conversationId, phoneNumber, result.botReply);

    if (result.sideEffect === 'FREEZE_SNAPSHOT') {
      await this.confirmAndFreeze(conversationId, phoneNumber, {
        ...stateBlob,
        ...result.stateBlobPatch,
      });
    }

    return { conversationId, botReply: result.botReply };
  }

  /**
   * The conversational equivalent of "proceed to payment" (§6):
   * freezes a priced snapshot, then hands off to Payment Domain
   * synchronously — the customer is mid-conversation waiting for the
   * STK prompt on their phone, so this cannot be async.
   */
  private async confirmAndFreeze(
    conversationId: string,
    phoneNumber: string,
    stateBlob: ConversationStateBlob,
  ): Promise<void> {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} vanished mid-flow`);
    }

    const subtotalKes = stateBlob.priceKes ?? 0;
    const discountKes = stateBlob.discountKes ?? 0;
    const shippingKes = 0; // Delivery fee calc not yet wired — Milestone 5.
    const totalKes = subtotalKes - discountKes + shippingKes;

    const snapshotId = await conversationCheckoutSnapshotRepository.create({
      conversationId,
      customerId: conversation.customerId,
      packageId: stateBlob.packageId ?? '',
      packageLabel: stateBlob.packageLabel ?? '',
      customerName: stateBlob.customerName ?? '',
      county: stateBlob.county ?? '',
      deliveryMethod: stateBlob.deliveryMethod ?? 'jumia_pickup',
      pickupStationId: stateBlob.pickupStationId ?? null,
      addressText: stateBlob.addressText ?? null,
      referralCode: stateBlob.referralCode ?? null,
      subtotalKes,
      discountKes,
      shippingKes,
      totalKes,
    });

    await conversationRepository.update(conversationId, {
      status: 'awaiting_payment',
      conversationCheckoutSnapshotId: snapshotId,
    });
    await publishEvent(
      'ConversationCheckoutSnapshotCreated',
      'conversationCheckoutSnapshot',
      snapshotId,
      { conversationId, totalKes },
    );

    const intentId = await paymentService.createIntent({
      conversationId,
      conversationCheckoutSnapshotId: snapshotId,
      customerId: conversation.customerId,
      phoneNumber,
      amountKes: totalKes,
    });

    try {
      await paymentService.initiateAttempt(intentId, {
        phone: phoneNumber,
        amountKes: totalKes,
        accountReference: `SQ-${conversationId.slice(0, 8)}`,
        transactionDesc: 'Snack Quest order',
      });
    } catch {
      // STK push never even reached Daraja — tell the customer, and
      // return the conversation to the confirmation step so a retry
      // (customer replies YES again) triggers a fresh attempt.
      await this.reply(
        conversationId,
        phoneNumber,
        "We couldn't start the M-Pesa payment prompt. Please reply YES to try again.",
      );
      await conversationRepository.update(conversationId, { status: 'active' });
      await conversationRepository.updateStep(conversationId, 'awaiting_order_confirmation');
    }
  }

  /**
   * Reacts to a resolved Daraja callback (called by the webhook route
   * after `paymentService.processCallback()`). Kept here, not in the
   * route file, so the actual domain reaction — what happens to the
   * conversation on success/failure — is Service-layer logic, not
   * route-handler glue.
   */
  async handlePaymentResult(result: ProcessCallbackResult): Promise<void> {
    if (
      result.status === 'duplicate' ||
      result.status === 'unmatched' ||
      result.status === 'ignored'
    ) {
      return;
    }

    const conversation = await conversationRepository.findById(result.conversationId);
    if (!conversation) {
      return;
    }

    if (result.status === 'succeeded') {
      await conversationCheckoutSnapshotRepository.updateStatus(
        result.snapshotId,
        'completed',
      );
      await conversationRepository.update(result.conversationId, {
        status: 'completed',
        currentStep: 'completed',
      });
      await this.reply(
        result.conversationId,
        conversation.phoneNumber,
        `Payment received! Receipt: ${result.mpesaReceiptNumber}. Your Snack Quest order is confirmed — we'll be in touch with delivery details.`,
      );
      return;
    }

    // 'failed' or 'amount_mismatch' — return the customer to
    // confirmation so replying YES again triggers a fresh attempt.
    await conversationRepository.update(result.conversationId, {
      status: 'active',
      currentStep: 'awaiting_order_confirmation',
    });
    await this.reply(
      result.conversationId,
      conversation.phoneNumber,
      "Your M-Pesa payment wasn't completed. Reply YES to try again.",
    );
  }

  /** Pauses automatic bot replies — an agent has taken over this thread (§6). */
  async assignAgent(conversationId: string, agentId: string): Promise<void> {
    await conversationRepository.update(conversationId, {
      status: 'agent_assigned',
      assignedAgentId: agentId,
    });
  }

  /** Hands control back to the bot after a human agent resolves the thread. */
  async returnToBot(conversationId: string): Promise<void> {
    await conversationRepository.update(conversationId, {
      status: 'active',
      assignedAgentId: null,
    });
  }

  private async reply(
    conversationId: string,
    phoneNumber: string,
    text: string,
  ): Promise<void> {
    const sendResult = await this.gateway.sendMessage({ phone: phoneNumber, text });
    await conversationRepository.appendMessage(conversationId, {
      direction: 'outbound',
      body: text,
      providerMessageId: sendResult.providerMessageId,
    });
  }
}

export const conversationService = new ConversationService();
export { ConversationService };

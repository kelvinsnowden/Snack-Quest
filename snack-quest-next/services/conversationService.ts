import 'server-only';

import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository, OutOfStockError } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { JUMIA_PACKAGE_TRACKER_URL } from '@/lib/integrations/jumia/constants';
import { DELIVERY_PROVIDER_FOR_METHOD } from '@/types';
import { formatDeliveryLabel } from '@/lib/delivery/format';
import { paymentService, type ProcessCallbackResult } from './paymentService';
import { orderService } from './orderService';
import { referralService } from './referralService';
import { deliveryService } from './deliveryService';
import { adConversionService } from './adConversionService';
import { NotificationService } from './notificationService';
import { publishEvent } from '@/lib/events/eventBus';
import {
  startConversationMessages,
  transition,
  type PackageOption,
} from '@/lib/conversation/stateMachine';
import type { WhatsAppGateway } from '@/lib/integrations/types';
import type { ConversationStateBlob, DeliveryDetails, PickupStationCandidate } from '@/types';

/**
 * Owns the conversation lifecycle (PLATFORM_ARCHITECTURE_V2.md §6):
 * find-or-create, turn-by-turn state machine transitions, and the
 * hand-off into Payment once an order is confirmed. This is the
 * *only* place inbound WhatsApp messages get processed — the webhook
 * route does nothing but resolve which business owns the message and
 * call `start()`.
 *
 * `businessId` is a parameter, not a constructor field, on every
 * public method — a single running server handles every tenant's
 * traffic, and which business a given inbound message belongs to is
 * resolved per-request (by the webhook route, from the message
 * itself), not fixed at construction. The `WhatsAppGateway` passed to
 * the constructor stays a plain object (used for tests, mainly) — the
 * *credentials* it resolves per call are already businessId-scoped
 * inside the Gateway itself.
 *
 * Deliberate, documented simplification still standing (not silently
 * assumed correct — a named follow-up): customer identification
 * always proceeds as guest (`customerId: null`) —
 * `CustomerRepository.findByPhone()` doesn't exist yet, and no real
 * purchase today is blocked by its absence.
 *
 * Two checkout paths converge on the same `freezeSnapshot()` helper
 * (redesign: multi-delivery-method checkout). Jumia pickup is priced
 * automatically the instant the customer confirms
 * (`confirmAndFreeze`, driven by the state machine's `FREEZE_SNAPSHOT`
 * side effect). Nairobi door delivery cannot be — Bolt's pricing is
 * dynamic — so it's priced by a human agent instead
 * (`priceDoorDeliveryAndCharge`, called from the internal agent API
 * route after `escalateToAgent` has paused the bot). Both paths freeze
 * an identically-shaped snapshot and trigger the same STK push; only
 * *who* supplies the delivery fee differs.
 */

async function getAvailablePackages(businessId: string): Promise<PackageOption[]> {
  const packages = await packageRepository.listActive(businessId);
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
  private readonly notifications: NotificationService;

  constructor(private readonly gateway: WhatsAppGateway = whatchimpGateway) {
    this.notifications = new NotificationService(gateway);
  }

  /**
   * The single entry point for every inbound WhatsApp message
   * (§6: "Creates or resumes a conversations document keyed by phone
   * number"). Handles first-contact welcome, mid-flow state
   * transitions, and human-takeover pausing, all in one place so
   * there is exactly one path an inbound message can take.
   */
  async start(
    businessId: string,
    phoneNumber: string,
    inboundMessage: InboundMessage,
    options: StartOptions = {},
  ): Promise<ConversationTurnResult> {
    const existing = await conversationRepository.findActiveByPhoneNumber(businessId, phoneNumber);

    let conversationId: string;
    const isNewConversation = !existing;

    if (existing) {
      conversationId = existing.id;
    } else {
      conversationId = await conversationRepository.create({ businessId, phoneNumber, ...options });
      await publishEvent(businessId, 'ConversationStarted', 'conversation', conversationId, {
        phoneNumber,
      });
    }

    await conversationRepository.appendMessage(conversationId, {
      direction: 'inbound',
      body: inboundMessage.text,
      providerMessageId: inboundMessage.providerMessageId ?? null,
    });

    if (existing?.conversation.status === 'agent_assigned') {
      // Human takeover (§6) — includes a conversation escalated for
      // door-delivery price confirmation: log the message, generate no
      // bot reply, the human agent (via the internal pricing API) is
      // driving this thread now.
      return { conversationId, botReply: null };
    }

    if (isNewConversation) {
      return this.sendWelcome(businessId, conversationId, phoneNumber);
    }

    return this.processTurn(
      businessId,
      conversationId,
      phoneNumber,
      existing!.conversation.currentStep,
      existing!.conversation.stateBlob,
      inboundMessage.text,
    );
  }

  private async sendWelcome(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
  ): Promise<ConversationTurnResult> {
    const availablePackages = await getAvailablePackages(businessId);
    const { nextStep, botReply } = startConversationMessages(availablePackages);
    await conversationRepository.updateStep(conversationId, nextStep);
    await this.reply(businessId, conversationId, phoneNumber, botReply);
    return { conversationId, botReply };
  }

  private async processTurn(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
    currentStep: import('@/types').ConversationStep,
    stateBlob: ConversationStateBlob,
    inboundText: string,
  ): Promise<ConversationTurnResult> {
    const availablePackages = await getAvailablePackages(businessId);

    // Populated on every turn spent in this step — the state machine
    // decides whether inboundText was a valid selection number or a
    // fresh search term; either way the Service has already searched.
    let pickupStationMatches: PickupStationCandidate[] | undefined;
    if (currentStep === 'awaiting_pickup_station_selection') {
      const matches = await pickupStationRepository.search(businessId, inboundText);
      pickupStationMatches = matches.map(({ id, data }) => ({
        id,
        name: data.name,
        county: data.county,
        town: data.town,
        deliveryFeeKes: data.deliveryFeeKes,
      }));
    }

    const result = transition({
      currentStep,
      stateBlob,
      inboundText,
      context: {
        availablePackages,
        isNairobi: isNairobiCounty(stateBlob.county),
        pickupStationMatches,
      },
    });

    await conversationRepository.updateStep(
      conversationId,
      result.nextStep,
      result.stateBlobPatch,
    );
    await this.reply(businessId, conversationId, phoneNumber, result.botReply);

    const mergedStateBlob = { ...stateBlob, ...result.stateBlobPatch };

    if (result.sideEffect === 'FREEZE_SNAPSHOT') {
      await this.confirmAndFreeze(businessId, conversationId, phoneNumber, mergedStateBlob);
    } else if (result.sideEffect === 'ESCALATE_TO_AGENT') {
      await this.escalateToAgent(businessId, conversationId, phoneNumber, mergedStateBlob);
    }

    return { conversationId, botReply: result.botReply };
  }

  /**
   * The core checkout-freeze logic shared by both delivery paths: runs
   * referral validation, computes subtotal/discount/delivery-fee/total,
   * writes the frozen `ConversationCheckoutSnapshot`, and marks the
   * conversation `awaiting_payment`. Callers own triggering the actual
   * STK push (and reacting to its failure) themselves, since the
   * automated and agent-priced paths need slightly different customer
   * messaging around it.
   */
  private async freezeSnapshot(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
    customerId: string | null,
    common: {
      packageId: string;
      packageLabel: string;
      priceKes: number;
      customerName: string;
      county: string;
      referralCode?: string;
    },
    delivery: DeliveryDetails,
  ): Promise<{ snapshotId: string; totalKes: number }> {
    const referral = common.referralCode
      ? await referralService.validateCode(businessId, common.referralCode)
      : null;

    const subtotalKes = common.priceKes;
    const discountKes = referral?.discountKes ?? 0;
    const totalKes = subtotalKes - discountKes + delivery.feeKes;

    const snapshotId = await conversationCheckoutSnapshotRepository.create({
      businessId,
      conversationId,
      customerId,
      phoneNumber,
      packageId: common.packageId,
      packageLabel: common.packageLabel,
      customerName: common.customerName,
      county: common.county,
      delivery,
      referralCode: common.referralCode ?? null,
      referralLinkId: referral?.referralLinkId ?? null,
      referralOwnerId: referral?.ownerId ?? null,
      referralCommissionKes: referral?.commissionKes ?? 0,
      subtotalKes,
      discountKes,
      deliveryFeeKes: delivery.feeKes,
      totalKes,
    });

    await conversationRepository.update(conversationId, {
      status: 'awaiting_payment',
      conversationCheckoutSnapshotId: snapshotId,
    });
    await publishEvent(
      businessId,
      'ConversationCheckoutSnapshotCreated',
      'conversationCheckoutSnapshot',
      snapshotId,
      { conversationId, totalKes },
    );

    return { snapshotId, totalKes };
  }

  /**
   * The Jumia-pickup automated path (§6: "proceed to payment"): the
   * customer just replied YES to a fully auto-priced order summary.
   * Freezes the snapshot, then hands off to Payment Domain
   * synchronously — the customer is mid-conversation waiting for the
   * STK prompt on their phone, so this cannot be async.
   */
  private async confirmAndFreeze(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
    stateBlob: ConversationStateBlob,
  ): Promise<void> {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} vanished mid-flow`);
    }

    const delivery: DeliveryDetails = {
      method: 'pickup',
      provider: DELIVERY_PROVIDER_FOR_METHOD.pickup,
      status: 'pending',
      shippingOrigin: 'Nairobi',
      feeKes: stateBlob.deliveryFeeKes ?? 0,
      county: stateBlob.county ?? '',
      pickupStationId: stateBlob.pickupStationId ?? null,
      pickupStationName: stateBlob.pickupStationName ?? null,
      addressText: null,
      landmark: null,
      estate: null,
      contactPhone: null,
      courierShipmentRef: null,
      // The generic tracker is known up front — the same URL for every
      // Jumia shipment, not something a shipment-creation call returns.
      trackingUrl: JUMIA_PACKAGE_TRACKER_URL,
    };

    const { snapshotId, totalKes } = await this.freezeSnapshot(
      businessId,
      conversationId,
      phoneNumber,
      conversation.customerId,
      {
        packageId: stateBlob.packageId ?? '',
        packageLabel: stateBlob.packageLabel ?? '',
        priceKes: stateBlob.priceKes ?? 0,
        customerName: stateBlob.customerName ?? '',
        county: stateBlob.county ?? '',
        referralCode: stateBlob.referralCode,
      },
      delivery,
    );

    const intentId = await paymentService.createIntent({
      businessId,
      conversationId,
      conversationCheckoutSnapshotId: snapshotId,
      customerId: conversation.customerId,
      phoneNumber,
      amountKes: totalKes,
    });

    try {
      await paymentService.initiateAttempt(businessId, intentId, {
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
        businessId,
        conversationId,
        phoneNumber,
        "We couldn't start the M-Pesa payment prompt. Please reply YES to try again.",
      );
      await conversationRepository.update(conversationId, { status: 'active' });
      await conversationRepository.updateStep(conversationId, 'awaiting_order_confirmation');
    }
  }

  /**
   * The Nairobi door-delivery hand-off (§ redesign): the bot has just
   * collected the customer's address details and cannot price Bolt's
   * dynamic delivery fee itself. Pauses the bot (`status: 'agent_assigned'`,
   * same mechanism as `assignAgent`) and pings the business's admin
   * WhatsApp number with everything a human needs to act — there is no
   * agent dashboard in this codebase yet, so the admin WhatsApp thread
   * is the real, working notification channel today; `escalationReason`
   * is stored on the conversation itself so a future queue UI can query
   * `status == 'agent_assigned'` without re-deriving why.
   */
  private async escalateToAgent(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
    stateBlob: ConversationStateBlob,
  ): Promise<void> {
    await conversationRepository.update(conversationId, {
      status: 'agent_assigned',
      assignedAgentId: null,
      escalationReason: 'door_delivery_price_confirmation',
    });

    const lines = [
      'Door delivery needs price confirmation (Bolt):',
      `Customer: ${stateBlob.customerName ?? 'unknown'} (${phoneNumber})`,
      `Box: ${stateBlob.packageLabel ?? 'unknown'} — KES ${stateBlob.priceKes ?? 0}`,
      `County: ${stateBlob.county ?? 'unknown'}`,
      `Address: ${stateBlob.addressText ?? ''}`,
      `Estate: ${stateBlob.estate ?? ''}`,
      `Landmark: ${stateBlob.landmark ?? ''}`,
      `Contact phone: ${stateBlob.contactPhone ?? phoneNumber}`,
      `Conversation: ${conversationId}`,
    ];
    await this.notifications.notifyAdmin(businessId, lines.join('\n'));
  }

  /**
   * The other half of the door-delivery hand-off: a human agent has
   * confirmed the address and priced the Bolt delivery fee. Freezes
   * the snapshot with that fee and triggers the same STK push the
   * automated path uses — from here on, payment/order/shipment
   * creation is identical to Jumia pickup. Called by the internal
   * agent-pricing API route, never by the state machine.
   */
  async priceDoorDeliveryAndCharge(
    conversationId: string,
    input: { agentId: string; feeKes: number },
  ): Promise<void> {
    if (!Number.isFinite(input.feeKes) || input.feeKes < 0) {
      throw new Error('feeKes must be a non-negative number');
    }

    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    if (conversation.status !== 'agent_assigned') {
      throw new Error(
        `Conversation ${conversationId} is not awaiting agent pricing (status: ${conversation.status})`,
      );
    }
    const { businessId, phoneNumber, stateBlob } = conversation;
    if (stateBlob.deliveryMethod !== 'door') {
      throw new Error(`Conversation ${conversationId} is not a door-delivery order`);
    }

    const delivery: DeliveryDetails = {
      method: 'door',
      provider: DELIVERY_PROVIDER_FOR_METHOD.door,
      status: 'pending_manual_booking',
      shippingOrigin: 'Nairobi',
      feeKes: input.feeKes,
      county: stateBlob.county ?? '',
      pickupStationId: null,
      pickupStationName: null,
      addressText: stateBlob.addressText ?? null,
      landmark: stateBlob.landmark ?? null,
      estate: stateBlob.estate ?? null,
      contactPhone: stateBlob.contactPhone ?? null,
      courierShipmentRef: null,
      // No generic Bolt tracker exists — the agent stays the customer's
      // point of contact for this order, unlike the Jumia path.
      trackingUrl: null,
    };

    const { snapshotId, totalKes } = await this.freezeSnapshot(
      businessId,
      conversationId,
      phoneNumber,
      conversation.customerId,
      {
        packageId: stateBlob.packageId ?? '',
        packageLabel: stateBlob.packageLabel ?? '',
        priceKes: stateBlob.priceKes ?? 0,
        customerName: stateBlob.customerName ?? '',
        county: stateBlob.county ?? '',
        // No automated referral step exists for the agent-assisted
        // path today — the agent applies one manually if relevant,
        // which this codebase doesn't yet build a mechanism for.
      },
      delivery,
    );

    const intentId = await paymentService.createIntent({
      businessId,
      conversationId,
      conversationCheckoutSnapshotId: snapshotId,
      customerId: conversation.customerId,
      phoneNumber,
      amountKes: totalKes,
    });

    try {
      await paymentService.initiateAttempt(businessId, intentId, {
        phone: phoneNumber,
        amountKes: totalKes,
        accountReference: `SQ-${conversationId.slice(0, 8)}`,
        transactionDesc: 'Snack Quest order',
      });
      await this.reply(
        businessId,
        conversationId,
        phoneNumber,
        `Thanks for waiting! Your total (box + Bolt delivery) is KES ${totalKes}. ` +
          'Check your phone to complete payment via M-Pesa.',
      );
    } catch (error) {
      // STK push never even reached Daraja — park the conversation back
      // on the agent (not the bot) so a retry means calling this same
      // pricing action again, not the customer texting anything.
      await conversationRepository.update(conversationId, { status: 'agent_assigned' });
      await this.reply(
        businessId,
        conversationId,
        phoneNumber,
        "We couldn't start the M-Pesa payment prompt. Our team will reach out shortly to try again.",
      );
      throw error;
    }
  }

  /**
   * Reacts to a resolved Daraja callback (called by the webhook route
   * after `paymentService.processCallback()`). Kept here, not in the
   * route file, so the actual domain reaction — what happens to the
   * conversation on success/failure — is Service-layer logic, not
   * route-handler glue. `businessId` isn't part of `ProcessCallbackResult`
   * (Payment Domain doesn't need to carry it once the callback is
   * already tenant-verified) — resolved here from the loaded
   * conversation, which is the authoritative source of its own tenant.
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
    const businessId = conversation.businessId;

    if (result.status === 'succeeded') {
      await this.completeOrder(businessId, result, conversation.phoneNumber);
      return;
    }

    // 'failed' or 'amount_mismatch'. Door-delivery orders were priced
    // by an agent (no automated order-confirmation step to retry from) —
    // return to the agent, not the bot. Jumia-pickup orders return to
    // confirmation so replying YES again triggers a fresh attempt.
    if (conversation.stateBlob.deliveryMethod === 'door') {
      await conversationRepository.update(result.conversationId, { status: 'agent_assigned' });
      await this.notifications.notifyAdmin(
        businessId,
        `M-Pesa payment failed for a Bolt door-delivery order — conversation ${result.conversationId}. Please re-confirm the price with the customer.`,
      );
      return;
    }
    await conversationRepository.update(result.conversationId, {
      status: 'active',
      currentStep: 'awaiting_order_confirmation',
    });
    await this.reply(
      businessId,
      result.conversationId,
      conversation.phoneNumber,
      "Your M-Pesa payment wasn't completed. Reply YES to try again.",
    );
  }

  /**
   * The rest of the real journey once payment has actually succeeded:
   * create the order (with inventory reservation), credit any
   * referral commission, create the shipment with whichever courier
   * `snapshot.delivery.provider` names, dispatch the Meta Purchase
   * event, notify the admin, and confirm to the customer. Every step
   * past order creation is best-effort — a courier outage or a missing
   * Meta credential must never undo a paid, confirmed order.
   */
  private async completeOrder(
    businessId: string,
    result: Extract<ProcessCallbackResult, { status: 'succeeded' }>,
    phoneNumber: string,
  ): Promise<void> {
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      result.snapshotId,
    );
    if (!snapshot) {
      return;
    }

    let orderId: string;
    try {
      orderId = await orderService.createFromConversationSnapshot({
        snapshotId: result.snapshotId,
        snapshot,
        paymentIntentId: result.intentId,
        mpesaReceiptNumber: result.mpesaReceiptNumber,
      });
    } catch (error) {
      if (error instanceof OutOfStockError) {
        // Money already collected, box unavailable — this needs a
        // human, not an automatic refund this codebase doesn't build
        // yet. Never silently lose a paid order.
        await this.notifications.notifyAdmin(
          businessId,
          `URGENT: payment succeeded for ${snapshot.packageLabel} (${phoneNumber}) but it's out of stock. Manual resolution needed. Payment intent: ${result.intentId}`,
        );
        await this.reply(
          businessId,
          result.conversationId,
          phoneNumber,
          "There's an issue with your order — our team will contact you shortly to sort it out. Your payment is safe.",
        );
        return;
      }
      throw error;
    }

    await conversationCheckoutSnapshotRepository.updateStatus(result.snapshotId, 'completed');
    await conversationRepository.update(result.conversationId, {
      status: 'completed',
      currentStep: 'completed',
    });

    if (snapshot.referralLinkId && snapshot.referralOwnerId) {
      try {
        await referralService.awardCommission({
          businessId,
          referralLinkId: snapshot.referralLinkId,
          ownerId: snapshot.referralOwnerId,
          orderId,
          conversationId: result.conversationId,
          discountKes: snapshot.discountKes,
          commissionKes: snapshot.referralCommissionKes,
        });
      } catch (error) {
        await publishEvent(businessId, 'ReferralAwardFailed', 'order', orderId, {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    try {
      await deliveryService.createShipmentForOrder(businessId, orderId, {
        customerName: snapshot.customerName,
        phoneNumber,
        delivery: snapshot.delivery,
      });
    } catch (error) {
      await publishEvent(businessId, 'ShipmentCreationFailed', 'order', orderId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

    await adConversionService.dispatchPurchase({
      businessId,
      orderId,
      phoneNumber,
      amountKes: snapshot.totalKes,
    });

    await this.notifications.notifyAdmin(
      businessId,
      `New order: ${snapshot.packageLabel} — KES ${snapshot.totalKes} — ${snapshot.customerName}, ` +
        `${formatDeliveryLabel(snapshot.delivery)}. Order ${orderId}.`,
    );

    // Jumia pickup gets the exact required copy (tracking URL + SMS
    // notice); door delivery has no pickup station or tracking URL to
    // reference — the human agent already told the customer the price,
    // so this just confirms the payment landed.
    const confirmationMessage =
      snapshot.delivery.method === 'pickup'
        ? `Payment received! Receipt: ${result.mpesaReceiptNumber}. Your Snack Quest box will be curated within 24 hours and handed over to Jumia for delivery. Once your package reaches your selected Jumia Pickup Station, you will receive an SMS from Jumia containing your tracking number and pickup instructions. You can track your shipment anytime at: ${JUMIA_PACKAGE_TRACKER_URL}`
        : `Payment received! Receipt: ${result.mpesaReceiptNumber}. Your Snack Quest order is confirmed — we're preparing your box and will arrange your Bolt delivery shortly.`;

    await this.reply(businessId, result.conversationId, phoneNumber, confirmationMessage);
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
      escalationReason: null,
    });
  }

  private async reply(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
    text: string,
  ): Promise<void> {
    const sendResult = await this.gateway.sendMessage({ businessId, phone: phoneNumber, text });
    await conversationRepository.appendMessage(conversationId, {
      direction: 'outbound',
      body: text,
      providerMessageId: sendResult.providerMessageId,
    });
  }
}

export const conversationService = new ConversationService();
export { ConversationService };

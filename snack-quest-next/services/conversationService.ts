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
import { walletService } from './walletService';
import { featureFlagService } from './featureFlagService';
import { NotificationService } from './notificationService';
import { publishEvent } from '@/lib/events/eventBus';
import {
  bootstrapFromCatalogSelection,
  formatFinalOrderSummaryMessage,
  startConversationMessages,
  transition,
  type PackageOption,
} from '@/lib/conversation/stateMachine';
import type { WhatsAppGateway } from '@/lib/integrations/types';
import type {
  Conversation,
  ConversationStateBlob,
  ConversationStatus,
  ConversationStep,
  DeliveryDetails,
  PickupStationCandidate,
} from '@/types';

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
 * (redesign: multi-delivery-method checkout) and on the same rule
 * (redesign: customer-controlled STK push) — an STK push is never
 * sent as a side effect of pricing, only in direct response to the
 * customer's own PAY/PROCEED/CONFIRM reply. Jumia pickup is priced
 * automatically; Nairobi door delivery is priced by a human agent
 * (`priceDoorDelivery`, called from the internal agent API route after
 * `escalateToAgent` has paused the bot) — but either way, pricing only
 * ever produces a quotation and moves the conversation to
 * `awaiting_customer_payment_confirmation`. `confirmAndFreeze` (the
 * state machine's `FREEZE_SNAPSHOT` side effect, fired only once the
 * customer has explicitly confirmed) is the one place that actually
 * freezes the snapshot and triggers the STK push, for both delivery
 * methods alike.
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
  /** A text referral/discount code, pre-supplied by the caller (§ startFromCatalogSelection) — never applied to `Conversation` itself, only pre-fills `stateBlob.referralCode` for the existing `awaiting_referral_code` freeze-time re-validation to check. */
  referralCode?: string | null;
}

export interface ConversationTurnResult {
  conversationId: string;
  botReply: string | null;
}

/** A product already resolved and validated by the caller of `startFromCatalogSelection` — never a raw, unchecked id. */
export interface ValidatedCatalogProduct {
  id: string;
  name: string;
  priceKes: number;
}

export interface CatalogSelectionResult {
  conversationId: string;
  nextStep: ConversationStep;
  botReply: string;
}

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} not found`);
    this.name = 'ConversationNotFoundError';
  }
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

    // A global command, checked ahead of the state machine and never
    // consuming a turn of it (§ Phase 4: Customer loyalty / Quest
    // system) — a customer can ask their balance from any step,
    // including their very first-ever message, without derailing
    // whatever they were doing (e.g. mid pickup-station search).
    const normalizedCommand = inboundMessage.text.trim().toUpperCase();
    if (
      (normalizedCommand === 'BALANCE' || normalizedCommand === 'WALLET') &&
      (await featureFlagService.isEnabled(businessId, 'customer_balance_command'))
    ) {
      return this.replyWithWalletBalance(businessId, conversationId, phoneNumber);
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

  /** Answers the BALANCE/WALLET global command — never touches `currentStep`/`stateBlob`, so it can't derail whatever the customer was mid-way through. */
  private async replyWithWalletBalance(
    businessId: string,
    conversationId: string,
    phoneNumber: string,
  ): Promise<ConversationTurnResult> {
    const { balanceKes } = await walletService.getBalance(businessId, phoneNumber);
    const botReply =
      balanceKes > 0
        ? `Your Snack Quest wallet balance is KES ${balanceKes}. It's automatically applied to your next order.`
        : "You don't have any wallet credit yet. You'll earn some after your first order — keep an eye out!";
    await this.reply(businessId, conversationId, phoneNumber, botReply);
    return { conversationId, botReply };
  }

  /**
   * The `POST /checkout/start` entry point (§ Product Catalog
   * checkout hand-off): a customer just selected a box from
   * Whatchimp's own Product Catalog UI, not from the bot's numbered
   * text list — Whatchimp calls this directly instead of relaying a
   * free-text message. `product` is already validated by the caller
   * (existence, active, in stock, current price — see
   * `app/api/checkout/start/route.ts`); this method never re-validates
   * it, same Repository/Service boundary as everywhere else. Skips
   * straight past `awaiting_package_selection` to
   * `awaiting_customer_details`, exactly where a successful text match
   * would have landed — from here on this is an ordinary conversation,
   * indistinguishable from one that started by text.
   */
  async startFromCatalogSelection(
    businessId: string,
    phoneNumber: string,
    product: ValidatedCatalogProduct,
    options: StartOptions = {},
  ): Promise<CatalogSelectionResult> {
    const existing = await conversationRepository.findActiveByPhoneNumber(businessId, phoneNumber);
    if (existing?.conversation.status === 'agent_assigned') {
      throw new Error(
        `Conversation for ${phoneNumber} is already with a human agent — cannot start a new catalog checkout until that's resolved.`,
      );
    }

    let conversationId: string;
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
      body: `[Product Catalog selection] ${product.name}`,
      providerMessageId: null,
    });

    const { nextStep, stateBlobPatch, botReply } = bootstrapFromCatalogSelection(product, {
      referralCode: options.referralCode,
    });
    await conversationRepository.updateStep(conversationId, nextStep, stateBlobPatch);
    await this.reply(businessId, conversationId, phoneNumber, botReply);

    return { conversationId, nextStep, botReply };
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
  ): Promise<{ snapshotId: string; totalKes: number; walletCreditAppliedKes: number }> {
    const referral = common.referralCode
      ? await referralService.validateCode(businessId, common.referralCode)
      : null;

    const subtotalKes = common.priceKes;
    const discountKes = referral?.discountKes ?? 0;
    // Wallet credit is applied on top of any referral discount, capped
    // at what's left of the order after it — never below zero, and
    // never more than the customer's actual available balance (§
    // Phase 4: Customer loyalty / Quest system). Only reserved here;
    // the real debit happens in `completeOrder()`, once payment for
    // this reduced amount has actually succeeded.
    const walletCreditAppliedKes = await walletService.redeemableAmount(
      businessId,
      phoneNumber,
      Math.max(subtotalKes - discountKes, 0),
    );
    const totalKes = subtotalKes - discountKes - walletCreditAppliedKes + delivery.feeKes;

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
      walletCreditAppliedKes,
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

    return { snapshotId, totalKes, walletCreditAppliedKes };
  }

  /**
   * The one place either checkout path actually charges the customer
   * (redesign: customer-controlled STK push) — reached only via the
   * state machine's `FREEZE_SNAPSHOT` side effect, which only fires
   * once the customer has explicitly replied PAY/PROCEED/CONFIRM from
   * `awaiting_customer_payment_confirmation`. Builds the right
   * `DeliveryDetails` for whichever method priced this order
   * (`stateBlob.deliveryMethod` — pickup's fee was computed
   * automatically at station selection; door's was set by a human
   * agent via `priceDoorDelivery`, already sitting in
   * `stateBlob.deliveryFeeKes` either way), freezes the snapshot, then
   * hands off to Payment Domain synchronously — the customer is
   * mid-conversation waiting for the STK prompt on their phone, so
   * this cannot be async.
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

    const isPickup = stateBlob.deliveryMethod === 'pickup';

    // Snack Quest OS is always the pricing authority — never trust the
    // total a customer was quoted earlier without re-checking it right
    // before charging. The box price can change (an admin edit) for
    // either method; a pickup station's fee can too. Door delivery's
    // fee has no live source to drift from — a human agent set it once
    // and nothing in this codebase re-derives it automatically.
    const currentPackage = await packageRepository.findById(businessId, stateBlob.packageId ?? '');
    const currentPriceKes = currentPackage?.priceKes ?? stateBlob.priceKes ?? 0;
    let currentDeliveryFeeKes = stateBlob.deliveryFeeKes ?? 0;
    if (isPickup && stateBlob.pickupStationId) {
      const currentStation = await pickupStationRepository.findById(
        businessId,
        stateBlob.pickupStationId,
      );
      if (currentStation) {
        currentDeliveryFeeKes = currentStation.deliveryFeeKes;
      }
    }
    const priceDrifted = currentPriceKes !== (stateBlob.priceKes ?? 0);
    const feeDrifted = isPickup && currentDeliveryFeeKes !== (stateBlob.deliveryFeeKes ?? 0);
    if (priceDrifted || feeDrifted) {
      const revalidatedStateBlob: ConversationStateBlob = {
        ...stateBlob,
        priceKes: currentPriceKes,
        deliveryFeeKes: currentDeliveryFeeKes,
      };
      await conversationRepository.updateStep(
        conversationId,
        'awaiting_customer_payment_confirmation',
        { priceKes: currentPriceKes, deliveryFeeKes: currentDeliveryFeeKes },
      );
      await this.reply(
        businessId,
        conversationId,
        phoneNumber,
        `Prices have been updated since we last quoted you:\n\n${formatFinalOrderSummaryMessage(revalidatedStateBlob)}`,
      );
      return;
    }

    const delivery: DeliveryDetails = isPickup
      ? {
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
          // The generic tracker is known up front — the same URL for
          // every Jumia shipment, not something a shipment-creation
          // call returns.
          trackingUrl: JUMIA_PACKAGE_TRACKER_URL,
        }
      : {
          method: 'door',
          provider: DELIVERY_PROVIDER_FOR_METHOD.door,
          status: 'pending_manual_booking',
          shippingOrigin: 'Nairobi',
          // Set by a human agent in priceDoorDelivery(), never re-derived here.
          feeKes: stateBlob.deliveryFeeKes ?? 0,
          county: stateBlob.county ?? '',
          pickupStationId: null,
          pickupStationName: null,
          addressText: stateBlob.addressText ?? null,
          landmark: stateBlob.landmark ?? null,
          estate: stateBlob.estate ?? null,
          contactPhone: stateBlob.contactPhone ?? null,
          courierShipmentRef: null,
          // No generic Bolt tracker exists — the agent stays the
          // customer's point of contact for this order, unlike Jumia.
          trackingUrl: null,
        };

    const { snapshotId, totalKes, walletCreditAppliedKes } = await this.freezeSnapshot(
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

    if (walletCreditAppliedKes > 0) {
      await this.reply(
        businessId,
        conversationId,
        phoneNumber,
        `🎉 KES ${walletCreditAppliedKes} wallet credit applied — your total is now KES ${totalKes}.`,
      );
    }

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
      // (customer replies PAY again) triggers a fresh attempt.
      await this.reply(
        businessId,
        conversationId,
        phoneNumber,
        "We couldn't start the M-Pesa payment prompt. Please reply PAY to try again.",
      );
      await conversationRepository.update(conversationId, { status: 'active' });
      await conversationRepository.updateStep(conversationId, 'awaiting_customer_payment_confirmation');
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

    // Tell the BSP layer too, best-effort — Firestore above is already
    // the real source of truth for the handoff regardless of whether
    // this succeeds (see WhatsAppGateway.assignHumanAgent's own doc).
    try {
      await this.gateway.assignHumanAgent({
        businessId,
        phone: phoneNumber,
        reason: 'door_delivery_price_confirmation',
      });
    } catch (error) {
      await publishEvent(businessId, 'AgentAssignmentSyncFailed', 'conversation', conversationId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

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
   * confirmed the address and priced the Bolt delivery fee. This does
   * NOT charge the customer (redesign: customer-controlled STK push)
   * — it only records the price, hands control back to the bot
   * (`status: 'active'`), and sends the itemized quotation ending in
   * "reply PAY". The actual STK push only fires later, from
   * `confirmAndFreeze`, in direct response to the customer's own PAY
   * reply — exactly the same gate the automated Jumia-pickup path
   * goes through. Called by the internal agent-pricing API route,
   * never by the state machine.
   */
  async priceDoorDelivery(
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

    const patch: Partial<ConversationStateBlob> = { deliveryFeeKes: input.feeKes };
    await conversationRepository.updateStep(
      conversationId,
      'awaiting_customer_payment_confirmation',
      patch,
    );
    await conversationRepository.update(conversationId, {
      status: 'active',
      assignedAgentId: input.agentId,
      escalationReason: null,
    });

    await this.reply(
      businessId,
      conversationId,
      phoneNumber,
      formatFinalOrderSummaryMessage({ ...stateBlob, ...patch }),
    );
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

    // 'failed' or 'amount_mismatch'. The price (whether auto-computed
    // for pickup or agent-set for door delivery) is already sitting in
    // stateBlob — no need to re-price or re-escalate to an agent, just
    // return to the same customer-controlled confirmation step so
    // replying PAY again triggers a fresh STK attempt. Identical
    // handling for both delivery methods now that neither one charges
    // the customer without an explicit PAY reply.
    await conversationRepository.update(result.conversationId, {
      status: 'active',
      currentStep: 'awaiting_customer_payment_confirmation',
    });
    await this.reply(
      businessId,
      result.conversationId,
      conversation.phoneNumber,
      "Your M-Pesa payment wasn't completed. Reply PAY to try again.",
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

    // Wallet redemption + milestone bonus (§ Phase 4: Customer loyalty
    // / Quest system) — both best-effort, same discipline as the
    // referral commission above: a paid, confirmed order is never
    // undone by a wallet-write failure.
    if (snapshot.walletCreditAppliedKes > 0) {
      try {
        await walletService.redeemAtCheckout(businessId, phoneNumber, snapshot.walletCreditAppliedKes, orderId);
      } catch (error) {
        await publishEvent(businessId, 'WalletRedemptionFailed', 'order', orderId, {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }
    let milestoneAwardKes = 0;
    try {
      const paidOrderCount = await walletService.countPaidOrders(businessId, phoneNumber);
      const milestone = await walletService.awardMilestoneIfEligible(businessId, phoneNumber, orderId, paidOrderCount);
      if (milestone.awarded) {
        milestoneAwardKes = milestone.amountKes;
      }
    } catch (error) {
      await publishEvent(businessId, 'WalletMilestoneAwardFailed', 'order', orderId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
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

    // Best-effort, same discipline as the shipment/referral calls
    // above — Firestore's `status: 'completed'` above is already the
    // real source of truth regardless of whether the BSP's own inbox
    // sync succeeds.
    try {
      await this.gateway.updateConversationStatus({
        businessId,
        phone: phoneNumber,
        status: 'resolved',
      });
    } catch (error) {
      await publishEvent(businessId, 'ConversationStatusSyncFailed', 'order', orderId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

    // Jumia pickup gets the exact required copy (tracking URL + SMS
    // notice); door delivery has no pickup station or tracking URL to
    // reference — the human agent already told the customer the price,
    // so this just confirms the payment landed.
    const confirmationMessage =
      snapshot.delivery.method === 'pickup'
        ? `Payment received! Receipt: ${result.mpesaReceiptNumber}. Your Snack Quest box will be curated within 24 hours and handed over to Jumia for delivery. Once your package reaches your selected Jumia Pickup Station, you will receive an SMS from Jumia containing your tracking number and pickup instructions. You can track your shipment anytime at: ${JUMIA_PACKAGE_TRACKER_URL}`
        : `Payment received! Receipt: ${result.mpesaReceiptNumber}. Your Snack Quest order is confirmed — we're preparing your box and will arrange your Bolt delivery shortly.`;

    const milestoneMessage =
      milestoneAwardKes > 0 ? `\n\n🎁 You just earned KES ${milestoneAwardKes} wallet credit — reply BALANCE anytime to check it.` : '';

    await this.reply(businessId, result.conversationId, phoneNumber, `${confirmationMessage}${milestoneMessage}`);
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

  /**
   * Admin: Conversation monitoring (§ Admin: Conversation monitoring)
   * — the tenant-scoped, existence-checked entry points a staff-facing
   * route calls, wrapping the bare `assignAgent`/`returnToBot` above
   * (which trust their caller to have already resolved the right
   * conversation, same as every other Repository-adjacent method in
   * this Service).
   */
  async listConversations(
    businessId: string,
    options: { status?: ConversationStatus; cursor?: string } = {},
  ): ReturnType<typeof conversationRepository.listByBusiness> {
    return conversationRepository.listByBusiness(businessId, options);
  }

  /** Human Sales Agent workspace (§ Human Sales Agent workspace) — one agent's own worklist, every status, not just the pre-claim `agent_assigned` one (see `ConversationRepository.listByAssignedAgent`). */
  async listMyConversations(
    businessId: string,
    agentId: string,
    options: { status?: ConversationStatus; cursor?: string } = {},
  ): ReturnType<typeof conversationRepository.listByAssignedAgent> {
    return conversationRepository.listByAssignedAgent(businessId, agentId, options);
  }

  async getConversation(businessId: string, conversationId: string): Promise<Conversation> {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation || conversation.businessId !== businessId) {
      throw new ConversationNotFoundError(conversationId);
    }
    return conversation;
  }

  async adminAssignAgent(businessId: string, conversationId: string, agentId: string): Promise<void> {
    await this.getConversation(businessId, conversationId);
    await this.assignAgent(conversationId, agentId);
  }

  async adminReturnToBot(businessId: string, conversationId: string): Promise<void> {
    await this.getConversation(businessId, conversationId);
    await this.returnToBot(conversationId);
  }

  /**
   * The tenant-checked entry point a real staff-authenticated route
   * calls (§ Human Sales Agent workspace — replaces the shared-secret
   * `/api/internal/.../price-door-delivery` route's direct call to the
   * bare `priceDoorDelivery` below, now that staff auth actually
   * exists). Existence/tenant-checked the same way as
   * `adminAssignAgent`/`adminReturnToBot`; `priceDoorDelivery` itself
   * still does its own state/delivery-method validation.
   */
  async adminPriceDoorDelivery(
    businessId: string,
    conversationId: string,
    input: { agentId: string; feeKes: number },
  ): Promise<void> {
    await this.getConversation(businessId, conversationId);
    await this.priceDoorDelivery(conversationId, input);
  }

  /** A staff member replying to the customer directly (§ Admin: Conversation monitoring — the human agent queue's actual point). */
  async sendAgentReply(businessId: string, conversationId: string, text: string): Promise<void> {
    const conversation = await this.getConversation(businessId, conversationId);
    await this.reply(businessId, conversationId, conversation.phoneNumber, text);
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

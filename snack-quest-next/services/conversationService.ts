import 'server-only';

import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository, OutOfStockError } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { whatchimpGateway } from '@/lib/integrations/whatchimp/whatchimpGateway';
import { textSmsGateway } from '@/lib/integrations/sms/textSmsGateway';
import { toSmsSafeText } from '@/lib/sms/gsm7';
import { Timestamp } from 'firebase-admin/firestore';
import { DELIVERY_PROVIDER_FOR_METHOD } from '@/types';
import type { ConversionAttribution, GuaranteedPick, ManualPaymentRecord, SnackItem } from '@/types';
import { orderBoxSummary, type CheckoutLineItem } from '@/types/checkoutLine';
import { formatDeliveryLabel } from '@/lib/delivery/format';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { normalizeEmail } from '@/lib/checkout/email';
import { computeCheckoutTotals, redeemableCeilingKes, MAX_CHECKOUT_QUANTITY } from '@/lib/checkout/pricing';
import { stkRetryWaitSeconds } from '@/lib/checkout/stkTiming';
import { toMillis } from '@/lib/firestoreTimestamp';
import {
  fargoZoneFor,
  DELIVERY_COURIER,
  FARGO_PACKAGE_CATEGORY,
  FARGO_SHIPPING_ORIGIN,
  isFargoZone,
  isMetroLocation,
  isSameDayAvailableAt,
  metroAreaLabel,
  SAME_DAY_CUTOFF_HOUR,
  WHATSAPP_DOOR_SERVICE_LEVEL,
  type FargoServiceLevel,
} from '@/lib/delivery/deliveryPricing';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { offersGuaranteedPicks, validateGuaranteedPicks } from '@/lib/packages/guaranteedPicks';
import { isOfferExpired } from '@/lib/packages/offerExpiry';
import { RESCUE_OFFER_EVENTS } from '@/lib/analytics/rescueOfferEvents';
import { CREATOR_PACKAGE_DISCOUNT_KES } from '@/lib/creators/creatorCheckoutDiscount';
import { isSelfReferral } from '@/lib/creators/selfReferralGuard';
import { formatOrderNumber } from '@/lib/orders/format';
import { paymentService, type ProcessCallbackResult } from './paymentService';
import { orderService } from './orderService';
import { referralService } from './referralService';
import { deliveryService } from './deliveryService';
import { adConversionService } from './adConversionService';
import { analyticsEventService } from './analyticsEventService';
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
  DeliveryMethod,
  PickupStationCandidate,
  WebCheckoutPricing,
  WebCheckoutQuote,
  WebCheckoutStatusResponse,
} from '@/types';
import type {
  ApplyReferralResponse,
  OrderPaymentStatus,
  OrderStatusResponse,
  PickupStationOption,
  QuoteDeliveryResponse,
  WhatchimpCheckoutResponse,
} from '@/types/whatchimpBridge';

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

/**
 * What to tell the customer their payment was, in one short fragment
 * that reads naturally inside the confirmation SMS for every payment
 * route (§ super-admin manual payment orders):
 *
 *   "KES 2500 (M-Pesa NLJ7RT61SV)."   — a normal Daraja payment
 *   "KES 2500 (M-Pesa TXY9KL22PQ)."   — a transfer the customer sent themselves
 *   "KES 2500 (cash)."                — cash at a stand
 *   "KES 2500 (bank transfer)."       — bank transfer
 *
 * Never invents a receipt: a method with no code says the method
 * instead, which is both true and the thing the customer would
 * recognise.
 */
export function formatPaymentReference(
  mpesaReceiptNumber: string | null,
  manualPayment: ManualPaymentRecord | null | undefined,
): string {
  if (mpesaReceiptNumber) {
    return `M-Pesa ${mpesaReceiptNumber}`;
  }
  switch (manualPayment?.method) {
    case 'cash':
      return 'cash';
    case 'bank_transfer':
      return manualPayment.reference ? `bank transfer ${manualPayment.reference}` : 'bank transfer';
    case 'mpesa_manual':
      return 'M-Pesa';
    default:
      // A Daraja payment whose callback somehow carried no receipt —
      // already an anomaly the reconciliation sweep flags; the customer
      // still gets a truthful confirmation rather than a blank.
      return 'payment received';
  }
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

/**
 * The one thing `reply()` actually depends on — deliberately narrower
 * than `WhatsAppGateway` so a caller building a "silent" engine (§
 * WhatChimp Integration Redesign, Phase 2) can supply just this,
 * without having to fake the rest of the Gateway interface.
 */
export interface ConversationOutputSink {
  send(input: { businessId: string; phone: string; text: string }): Promise<{ providerMessageId: string }>;
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

/**
 * Re-exported so existing importers of `MAX_WEB_CHECKOUT_QUANTITY` from
 * this module keep working — the definition itself now lives in
 * `lib/checkout/pricing.ts` (as `MAX_CHECKOUT_QUANTITY`) so the client
 * quantity stepper and this server-side check share one number instead
 * of two that could drift apart.
 */
export const MAX_WEB_CHECKOUT_QUANTITY = MAX_CHECKOUT_QUANTITY;

/**
 * How many *different* boxes one order may hold (§ more than one box
 * per order).
 *
 * A ceiling rather than none at all: every line is a catalogue read,
 * a stock check and a row on a packing list, and an order naming
 * hundreds of boxes is a request to exhaust the request, not a
 * customer. Comfortably above any real order — this shop sells three
 * boxes today.
 */
export const MAX_WEB_CHECKOUT_LINES = 10;

/** The customer got something wrong (or sent something impossible) — safe to show them verbatim, answered as 400. */
export class WebCheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebCheckoutValidationError';
  }
}

/** The request was well-formed but this customer can't check out right now — answered as 409. */
export class WebCheckoutConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebCheckoutConflictError';
  }
}

/** Exactly `WebCheckoutRequest`, but with the fields the route has already narrowed to real types. */
export interface WebCheckoutInput {
  /**
   * The customer pays the delivery fee to the courier at the door
   * instead of now (§ delivery paid on delivery).
   *
   * Staff-only, and enforced as such by the route: this is an
   * arrangement made in a conversation with a customer, not something
   * the public checkout offers, and a request that could set it would
   * be a request that could take a box without paying for its
   * delivery.
   */
  /** Staff-only; see `DeliveryDetails.feeCollection`. Ignored without `initiatedBy`. */
  deliveryFeeCollection?: 'prepaid' | 'on_delivery' | 'waived';
  /**
   * Every box on the order, when the customer chose more than one
   * (§ more than one box per order). Absent for a single-box order,
   * which keeps using `packageId`/`quantity` exactly as before.
   */
  items?: { packageId: string; quantity: number; guaranteedSnackIds?: string[] }[];
  /**
   * Snack ids the customer chose as guaranteed picks (§ Premium:
   * choose 5, discover the rest). Ids only — every name, photo and
   * eligibility decision is re-read from the catalogue server-side.
   * Ignored for a box that does not offer picks.
   *
   * Applies to the *first* pick-offering box. A second one carries its
   * own ids on its `items` entry — an order with two Premium-style
   * boxes needs two sets of picks, and one list at the top of the
   * order cannot say which box it belongs to.
   */
  guaranteedSnackIds?: string[];
  /**
   * Set only by the staff-initiated order route, only for a
   * super admin, and only when the customer has *already* paid
   * (§ super-admin manual payment orders): cash at a stand, an M-Pesa
   * transfer they sent themselves, or a bank transfer.
   *
   * Its presence changes exactly two things — no STK push is sent, and
   * the intent is settled from this record instead of from a Daraja
   * callback. Everything before that point is byte-for-byte the normal
   * checkout: same validation, same stock check, same pricing, same
   * referral and wallet handling. There is deliberately no amount field
   * here; a super admin can record *that* money arrived, never *how
   * much*, so this can never become a discount mechanism.
   */
  manualPayment?: Omit<ManualPaymentRecord, 'recordedAt'>;
  packageId: string;
  quantity: number;
  customerName: string;
  phone: string;
  /** Optional (§ optional email capture). Dropped rather than rejected when unusable — an unreachable address is not a reason to refuse a paying customer. */
  email?: string;
  county: string;
  /**
   * Door delivery only. Fargo's "Nairobi and surrounding" area does not
   * follow county lines, so a Kiambu address needs its town to know
   * whether it is Thika (served) or somewhere further out (not).
   */
  town?: string;
  /** Door delivery only. Absent means next-day, which is the service every metro address can have. */
  serviceLevel?: 'next-day' | 'same-day';
  deliveryMethod: DeliveryMethod;
  pickupStationId?: string;
  addressText?: string;
  estate?: string;
  landmark?: string;
  contactPhone?: string;
  referralCode?: string;
  /**
   * Set by the route from a verified `sq_creator_session` cookie (§
   * Creator-Only Offers), never from anything the client's JSON body
   * claims — a creator buying for themselves gets
   * `CREATOR_PACKAGE_DISCOUNT_KES` off, same as any other discount
   * source, and stacks with a referral code the same way (both are
   * additive, neither is a special case in `computeCheckoutTotals`).
   */
  isCreatorCheckout?: boolean;
  /**
   * The verified creator session's own uid when `isCreatorCheckout` is
   * true, `null`/absent otherwise — same server-verified-only sourcing
   * as `isCreatorCheckout` itself. Used only to catch self-referral
   * (§ security audit, `lib/creators/selfReferralGuard.ts`): a creator
   * checking out with their own referral code voids the code entirely
   * rather than stacking a discount with a commission paid to
   * themselves.
   */
  creatorUid?: string | null;
  /**
   * Set when a staff member is placing this order on the customer's
   * behalf (§ staff-initiated orders) — an order taken over the phone,
   * at an event, or in a DM. Absent for a customer checking out
   * themselves on the website.
   *
   * It changes three things and nothing else: the transcript records
   * who placed it, the customer is told what is about to be charged
   * before the prompt arrives (an unexplained STK push is alarming),
   * and a domain event names the staff member. The pricing, the
   * snapshot and the payment are identical — a staff order is not a
   * privileged path that can discount anything.
   */
  initiatedBy?: { staffUid: string; staffName: string };
  /**
   * Captured by the route from the request's cookies/Referer before
   * calling here (§ close the loop: ad-conversion attribution) — the
   * one moment this app still has real browser context, since order
   * confirmation itself later happens off an async Daraja webhook with
   * none. Absent for a staff-initiated order (there's no browser
   * behind that one to attribute) and for anything that isn't a fresh
   * conversation (see `startWebCheckout`'s own comment on `existing`).
   */
  attribution?: ConversionAttribution | null;
}

export interface WebCheckoutResult {
  checkoutSessionId: string;
  payingPhone: string;
  stkPushSent: boolean;
  pricing: WebCheckoutPricing;
}

/** What a quote needs — a subset of `WebCheckoutInput`, since a customer mid-form hasn't supplied the rest yet. */
export interface WebCheckoutQuoteInput {
  packageId: string;
  quantity: number;
  /**
   * Every box being quoted, when there is more than one (§ more than
   * one box per order). The quote and the charge must agree, so this
   * mirrors `WebCheckoutInput.items` exactly — a customer shown one
   * box's price and charged for two would be the worst possible
   * version of this feature.
   */
  items?: { packageId: string; quantity: number }[];
  deliveryMethod: DeliveryMethod;
  /** Door delivery only — the quote has to show the speed the customer will actually be charged for. */
  serviceLevel?: 'next-day' | 'same-day';
  pickupStationId?: string;
  referralCode?: string;
  /** Optional — only used to look up wallet credit, and ignored when it isn't yet a valid number. */
  phone?: string;
  /** Same server-verified meaning as `WebCheckoutInput.isCreatorCheckout` — the quote and the charge must show the same discount, or a customer would pay more than they were quoted. */
  isCreatorCheckout?: boolean;
  /** Same server-verified meaning as `WebCheckoutInput.creatorUid`. */
  creatorUid?: string | null;
}

/**
 * The default customer-facing channel: an ordinary text.
 *
 * Deliberately the transactional SMS path and not the marketing one —
 * it does not consult `smsOptOuts`, which registers people who asked
 * to stop receiving *marketing*. A customer who opted out of offers
 * has not opted out of being told what an M-Pesa prompt on their
 * screen is for, and suppressing that would be the wrong kind of
 * obedient.
 */
const smsOutputSink: ConversationOutputSink = {
  send: ({ businessId, phone, text }) =>
    // Normalised here rather than at each of the fourteen call sites,
    // so a message written tomorrow is priced like the rest.
    textSmsGateway.send({ businessId, to: phone, body: toSmsSafeText(text) }),
};

class ConversationService {
  private readonly notifications: NotificationService;
  private readonly outputSink: ConversationOutputSink;

  /**
   * `outputSink` is the customer-facing reply channel only — `gateway`
   * itself still backs admin notifications (`this.notifications`) and
   * the best-effort BSP inbox sync calls (`assignHumanAgent`,
   * `updateConversationStatus`) regardless of what `outputSink` does,
   * so an admin never silently stops hearing about a door-delivery
   * escalation just because a caller wants customer replies captured
   * instead of sent (§ WhatChimp Integration Redesign, Phase 2 — the
   * channel-agnostic turn engine constructs a `ConversationService`
   * with the real `gateway` but a capturing `outputSink`).
   *
   * That seam is now carrying the weight it was built for: the default
   * is SMS, not WhatsApp (§ customer communications move to SMS).
   * Everything this service says to a customer — the message ahead of
   * an M-Pesa prompt on a staff-taken order, an agent's reply from
   * Admin, every bot turn — goes out as a text.
   *
   * The reason is reach rather than preference. A staff-taken order is
   * a cold outbound message to someone who never opened a WhatsApp
   * thread with the shop, and a business-initiated WhatsApp message to
   * a stranger is exactly the kind that does not arrive. A text does.
   */
  constructor(
    private readonly gateway: WhatsAppGateway = whatchimpGateway,
    outputSink: ConversationOutputSink = smsOutputSink,
  ) {
    this.notifications = new NotificationService(gateway);
    this.outputSink = outputSink;
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

  /**
   * The website checkout's single entry point (§ Website Becomes the
   * Primary Commerce Channel). The website collects everything in one
   * form instead of over several conversational turns, so this skips
   * the state machine entirely — but it deliberately runs the *same*
   * `freezeSnapshot` and the *same* `paymentService` hand-off the
   * WhatsApp path does, so there is still exactly one place that
   * prices an order and exactly one place that charges for it.
   *
   * It still creates/resumes a real `conversations` document. That's
   * not ceremony: the snapshot, the payment intent, the Daraja
   * callback's `handlePaymentResult` → `completeOrder` path, the admin
   * conversation view, and the order's own `conversationId` all key off
   * one, so a web order that skipped it would need a parallel copy of
   * every one of them. The web customer also gets the same WhatsApp
   * confirmations a bot customer does, for free, because
   * `completeOrder` already sends them.
   *
   * Pricing is authoritative here and nowhere else: the unit price is
   * re-read from `packages`, and the pickup fee from `pickupStations`,
   * at request time. Nothing the client sent about money is trusted,
   * because the client never sends any.
   */
  async startWebCheckout(
    businessId: string,
    input: WebCheckoutInput,
  ): Promise<WebCheckoutResult> {
    const quantity = Math.trunc(input.quantity);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_WEB_CHECKOUT_QUANTITY) {
      throw new WebCheckoutValidationError(
        `quantity must be a whole number between 1 and ${MAX_WEB_CHECKOUT_QUANTITY}`,
      );
    }

    const customerName = input.customerName.trim();
    if (customerName.length < 2) {
      throw new WebCheckoutValidationError('customerName is required');
    }
    const county = input.county.trim();
    if (!county) {
      throw new WebCheckoutValidationError('county is required');
    }

    // Throws InvalidPhoneNumberError for anything that isn't
    // unambiguously a Kenyan mobile number — an STK push to a
    // mis-normalized number charges a stranger.
    const phoneNumber = normalizeKenyanPhone(input.phone);

    // Normalized to null rather than validated into an error: the field
    // is optional, and a customer who mistyped their address still
    // wants their snacks.
    const customerEmail = normalizeEmail(input.email);

    /*
     * Every box on the order, priced from the catalogue (§ more than
     * one box per order).
     *
     * `input.items` is the multi-box form; `packageId`/`quantity` is
     * the one-box form every existing caller still uses, and the
     * WhatsApp path can only ever produce. Both end up as the same
     * list, so there is exactly one piece of code below that prices,
     * validates and reserves — a second path for "the simple case" is
     * how two boxes end up charged at one box's price.
     */
    const requested =
      input.items?.length
        ? input.items.map((item) => ({
            packageId: item.packageId,
            quantity: Math.trunc(item.quantity),
            // Carried through so each line's picks stay attached to
            // the box they were chosen for.
            ...(item.guaranteedSnackIds ? { guaranteedSnackIds: item.guaranteedSnackIds } : {}),
          }))
        : [{ packageId: input.packageId, quantity } as { packageId: string; quantity: number; guaranteedSnackIds?: string[] }];

    if (requested.length > MAX_WEB_CHECKOUT_LINES) {
      throw new WebCheckoutValidationError(
        `An order can hold at most ${MAX_WEB_CHECKOUT_LINES} different boxes`,
      );
    }
    // The same box twice is two lines claiming the same stock, and the
    // second would silently overwrite the first in any map keyed by id.
    // Refused rather than merged: the client that sent it is confused
    // about what the customer asked for, and guessing which count was
    // meant is not this code's decision to make.
    if (new Set(requested.map((item) => item.packageId)).size !== requested.length) {
      throw new WebCheckoutValidationError('Each box can only appear once — change its quantity instead');
    }
    for (const item of requested) {
      if (!Number.isFinite(item.quantity) || item.quantity < 1 || item.quantity > MAX_WEB_CHECKOUT_QUANTITY) {
        throw new WebCheckoutValidationError(
          `Every quantity must be a whole number between 1 and ${MAX_WEB_CHECKOUT_QUANTITY}`,
        );
      }
    }

    const boxes = new Map<string, NonNullable<Awaited<ReturnType<typeof packageRepository.findById>>>>();
    for (const item of requested) {
      const found = await packageRepository.findById(businessId, item.packageId);
      if (!found || !found.isActive || isOfferExpired(found.offerExpiresAt)) {
        throw new WebCheckoutValidationError(`Box ${item.packageId} is not available`);
      }
      // Checked per line, and named per line: "out of stock" on a
      // two-box order has to say which box, or the customer is left
      // guessing which half of their order to change.
      if (found.stockCount !== undefined && found.stockCount < item.quantity) {
        throw new WebCheckoutValidationError(
          found.stockCount <= 0
            ? `${found.name} is out of stock`
            : `Only ${found.stockCount} of ${found.name} left — reduce the quantity`,
        );
      }
      boxes.set(item.packageId, found);
    }

    const lines: CheckoutLineItem[] = requested.map((item) => {
      const found = boxes.get(item.packageId)!;
      return {
        packageId: item.packageId,
        packageLabel: found.name,
        quantity: item.quantity,
        unitPriceKes: found.priceKes,
      };
    });

    /*
     * The first line, and what everything downstream that predates
     * line items still reads. Keeping it means a one-box order writes
     * exactly the snapshot and order it always did, byte for byte.
     */
    const box = boxes.get(requested[0].packageId)!;

    // A customer mid-way through a WhatsApp conversation that a human
    // agent has taken over must not have an STK push fired at them
    // from a second channel — same guard `startFromCatalogSelection`
    // applies for the same reason. Staff placing the order are exempt:
    // they are that human agent, and refusing them here would block the
    // exact case staff-initiated orders exist for — someone on the
    // phone with a customer whose thread they've already taken over.
    const existing = await conversationRepository.findActiveByPhoneNumber(businessId, phoneNumber);
    if (existing?.conversation.status === 'agent_assigned' && !input.initiatedBy) {
      throw new WebCheckoutConflictError(
        'One of our team is already helping you with an order on WhatsApp — please finish there, or message us to start over.',
      );
    }
    // § Security audit — wallet double-discount: without this, a second
    // checkout for the same phone while the first STK push is still
    // pending would freeze a second snapshot against the same
    // not-yet-debited wallet balance (`walletService.redeemableAmount`
    // is a read, not a hold — see `freezeSnapshot`), letting one real
    // balance be applied as a discount on two orders. `awaiting_payment`
    // is transient: `handlePaymentResult`'s failure path resets it back
    // to `'active'` the moment Safaricom reports failure/cancellation,
    // so this never strands a customer whose payment genuinely failed —
    // only blocks starting a second one while the first might still
    // succeed. Staff exempt for the same reason `agent_assigned` is:
    // a staff member placing a fresh order over the phone is not the
    // race this guards against.
    //
    // Bounded by `STK_ATTEMPT_ABANDON_AFTER_MS`, and that bound is the
    // whole point. The paragraph above used to end "so this never
    // strands a customer whose payment genuinely failed" — which was
    // true only while Safaricom actually reports. When a push is
    // accepted but never delivered (a passkey that does not match the
    // shortcode does exactly this: real CheckoutRequestID, no prompt,
    // no callback), nothing ever resets the status, and the customer
    // is locked out of paying for good. They were being shown "try
    // again if it expired" by a screen that had already given up, and
    // then refused when they did.
    //
    // Once the window passes, the first prompt cannot still be sitting
    // unanswered on the customer's phone, so the race this guards
    // against is over and a fresh attempt is allowed. The stale intent
    // is left `processing` for the reconciliation sweep to resolve
    // against Safaricom — and a genuinely late callback still lands
    // correctly either way, because `processCallback` matches on the
    // attempt's `checkoutRequestId` and never consults the intent's or
    // the conversation's status.
    //
    // Note `toMillis` yields 0 for a missing timestamp, which makes an
    // unreadable one release the guard rather than hold it. That is the
    // deliberate direction to fail in: the worst case on release is a
    // race that needs one wallet balance reconciled, and the worst case
    // on hold is a customer who can never buy anything again.
    if (existing?.conversation.status === 'awaiting_payment' && !input.initiatedBy) {
      const waitSeconds = stkRetryWaitSeconds(toMillis(existing.conversation.lastMessageAt));
      if (waitSeconds > 0) {
        throw new WebCheckoutConflictError(
          `You already have a payment in progress — check your phone for the M-Pesa prompt. If nothing arrived, you can try again in ${waitSeconds} second${waitSeconds === 1 ? '' : 's'}.`,
        );
      }
    }

    const { delivery, stateBlob } = await this.buildWebDeliveryDetails(businessId, county, input);

    const conversationId =
      existing?.id ??
      (await conversationRepository.create({
        businessId,
        phoneNumber,
        attributionSnapshot: (input.attribution as Record<string, unknown> | null | undefined) ?? null,
      }));
    if (!existing) {
      await publishEvent(businessId, 'ConversationStarted', 'conversation', conversationId, {
        phoneNumber,
        channel: 'web',
      });
    }

    // Recorded as a transcript entry so the admin conversation view
    // shows *why* this thread suddenly has a payment against it —
    // otherwise a web order looks like a snapshot that appeared from
    // nowhere.
    await conversationRepository.appendMessage(conversationId, {
      direction: 'inbound',
      body: input.initiatedBy
        ? `[Staff order by ${input.initiatedBy.staffName}] ${quantity} x ${box.name}`
        : `[Website checkout] ${quantity} x ${box.name}`,
      providerMessageId: null,
    });
    await conversationRepository.updateStep(conversationId, 'awaiting_customer_payment_confirmation', {
      packageId: input.packageId,
      packageLabel: box.name,
      priceKes: box.priceKes,
      customerName,
      county,
      ...stateBlob,
      ...(input.referralCode ? { referralCode: input.referralCode } : {}),
    });

    /*
     * Guaranteed picks, re-derived from the real catalogue rather than
     * trusted (§ Premium: choose 5, discover the rest). The client
     * sends snack ids; everything that ends up on the packing list —
     * the count, the names, whether each snack is even eligible or
     * still in stock — is read here. A tampered request can order the
     * wrong box, never an unavailable snack.
     */
    /*
     * Picks belong to a box, so they are resolved per line
     * (§ more than one box per order).
     *
     * This used to refuse an order with two pick-offering boxes
     * outright — with one list of ids at the top of the order there
     * was no way to say which box they belonged to, and packing the
     * wrong one is worse than refusing. Now each line carries its own
     * ids, so the question does not arise and a customer can buy a
     * Premium and a Deluxe in one go.
     *
     * The first pick-offering box may still take its ids from the
     * top-level field, which is what the website sent before this and
     * what a one-box order still sends.
     */
    const wantedSnackIds = [
      ...(input.guaranteedSnackIds ?? []),
      ...requested.flatMap((item) => item.guaranteedSnackIds ?? []),
    ];
    const catalogue = wantedSnackIds.length
      ? await snackItemRepository.findManyById([...new Set(wantedSnackIds)])
      : new Map<string, SnackItem>();

    /*
     * Staff taking the order are writing a packing list, not making a
     * self-service choice (§ staff are not picking, they are packing)
     * — so any number of snacks, from any box, out of the whole
     * catalogue. See `validateGuaranteedPicks` for what still holds.
     */
    const staffPacking = Boolean(input.initiatedBy);

    let topLevelIdsUsed = false;
    for (const line of lines) {
      const lineBox = boxes.get(line.packageId)!;
      // A box that offers a customer nothing to choose can still be
      // packed with named snacks by staff, so this only skips ahead
      // for the website's own checkout.
      if (!staffPacking && !offersGuaranteedPicks(lineBox)) {
        continue;
      }
      const requestedLine = requested.find((item) => item.packageId === line.packageId);
      /*
       * Its own ids when it has them; otherwise the top-level list,
       * but only for the first pick box that asks. Letting a second
       * one fall back to the same list would silently pack two boxes
       * identically and call it the customer's choice.
       */
      let ids = requestedLine?.guaranteedSnackIds;
      if (ids === undefined && !topLevelIdsUsed) {
        ids = input.guaranteedSnackIds;
        topLevelIdsUsed = true;
      }

      const lineResult = validateGuaranteedPicks(businessId, lineBox, ids, catalogue, {
        staffPacking,
      });
      if (!lineResult.ok) {
        // Named, because "choose exactly 5 snacks" on a two-box order
        // does not say which box is short.
        throw new WebCheckoutValidationError(
          lines.length > 1 ? `${lineBox.name}: ${lineResult.reason}` : lineResult.reason,
        );
      }
      if (lineResult.picks.length) {
        line.guaranteedPicks = lineResult.picks;
      }
    }

    /*
     * What everything that predates per-line picks still reads: the
     * first box's picks, at the top of the snapshot. A one-box order
     * therefore writes exactly what it always did.
     */
    const pickResult = { picks: lines.find((line) => line.guaranteedPicks)?.guaranteedPicks ?? [] };

    // Staff-set only; the route refuses it from anyone else.
    /*
     * Staff-only. The field arrives over an HTTP body, so a customer
     * posting it at the public checkout must simply be priced as
     * normal — hence the `initiatedBy` requirement rather than trusting
     * the caller.
     */
    const feeCollection =
      input.initiatedBy && input.deliveryFeeCollection && input.deliveryFeeCollection !== 'prepaid'
        ? input.deliveryFeeCollection
        : null;

    const { snapshotId, totalKes, walletCreditAppliedKes, subtotalKes, discountKes } =
      await this.freezeSnapshot(
        businessId,
        conversationId,
        phoneNumber,
        existing?.conversation.customerId ?? null,
        {
          // The first line, so a one-box order freezes exactly the
          // snapshot it always did.
          packageId: lines[0].packageId,
          packageLabel: lines[0].packageLabel,
          priceKes: lines[0].unitPriceKes,
          quantity: lines[0].quantity,
          // Written only when there is genuinely more than one, so
          // every existing single-box snapshot keeps its exact shape
          // rather than gaining a one-element array.
          ...(lines.length > 1 ? { items: lines } : {}),
          ...(feeCollection ? { deliveryFeeCollection: feeCollection } : {}),
          customerName,
          customerEmail,
          county,
          referralCode: input.referralCode,
          isRescueOffer: box.isRescueOffer,
          isCreatorCheckout: input.isCreatorCheckout,
          creatorUid: input.creatorUid,
          guaranteedPicks: pickResult.picks,
        },
        delivery,
      );

    // A customer who didn't press anything is about to get an M-Pesa
    // prompt. Telling them what it's for, before it lands, is the
    // difference between a service and a scam — so this goes out ahead
    // of the push, not after it, and a send failure doesn't stop the
    // order (the staff member is on the phone with them anyway).
    //
    // Skipped entirely for an already-paid order: there is no prompt
    // coming, and promising one would be a lie. `completeOrder` sends
    // that customer a real confirmation moments later instead.
    if (input.initiatedBy && !input.manualPayment) {
      try {
        await this.reply(
          businessId,
          conversationId,
          phoneNumber,
          `Hi ${customerName.split(' ')[0]}, ${input.initiatedBy.staffName} from Snack Quest has set up your order:\n\n` +
            // Every box, not just the first: on a two-box order
            // naming one of them is how a customer is surprised by
            // what arrives (§ more than one box per order).
            `${orderBoxSummary({ items: lines, packageId: lines[0].packageId, packageLabel: box.name, quantity })}\n` +
            `${formatDeliveryLabel(delivery)}\n` +
            `Total: KES ${totalKes}\n` +
            /*
             * The prompt they are about to approve excludes the
             * delivery fee, so the total above is not everything they
             * pay. Saying so here — before the courier is at the door
             * asking for money nobody mentioned — is the whole point
             * of sending this message ahead of the push.
             */
            (feeCollection === 'on_delivery'
              ? `Plus KES ${delivery.feeKes} to the courier on delivery\n`
              : '') +
            '\nAn M-Pesa prompt is on its way — enter your PIN to confirm. If you were not expecting this, ignore it and nothing will be charged.',
        );
      } catch {
        // Best-effort, same discipline as every other notification here.
      }
    }

    const intentId = await paymentService.createIntent({
      businessId,
      conversationId,
      conversationCheckoutSnapshotId: snapshotId,
      customerId: existing?.conversation.customerId ?? null,
      phoneNumber,
      amountKes: totalKes,
    });

    /*
     * Already-paid order (§ super-admin manual payment orders). No STK
     * push is made at all — the intent is settled from the super
     * admin's record, then handed to the exact same
     * `handlePaymentResult` a real Daraja callback would go through.
     *
     * That reuse is the whole design. Order creation, the atomic stock
     * decrement, referral commission, wallet redemption and milestone,
     * shipment creation, ad-conversion dispatch, the admin notification
     * and both customer confirmations are one code path for both kinds
     * of payment — a cash order cannot silently skip a step that a
     * Daraja order performs, because there is no second implementation
     * for it to skip them in.
     */
    if (input.manualPayment) {
      const settlement = await paymentService.recordManualPayment({
        businessId,
        intentId,
        manualPayment: input.manualPayment,
      });
      if (!settlement.settled) {
        throw new WebCheckoutConflictError(settlement.reason ?? 'Could not record this payment.');
      }

      await this.handlePaymentResult({
        status: 'succeeded',
        intentId,
        conversationId,
        snapshotId,
        amountKes: totalKes,
        // Only a customer-initiated M-Pesa transfer has a real code to
        // record. Cash and bank transfers carry none rather than
        // something shaped like a Safaricom receipt.
        mpesaReceiptNumber:
          input.manualPayment.method === 'mpesa_manual' ? (input.manualPayment.reference ?? '') : '',
        // Admin-SDK Timestamp into a type declared with the client
        // SDK's — the same cast every other write in this codebase
        // uses at that boundary.
        manualPayment: {
          ...input.manualPayment,
          recordedAt: Timestamp.now() as unknown as ManualPaymentRecord['recordedAt'],
        },
      });

      await publishEvent(businessId, 'StaffRecordedPaidOrder', 'conversation', conversationId, {
        staffUid: input.initiatedBy?.staffUid ?? null,
        staffName: input.initiatedBy?.staffName ?? null,
        method: input.manualPayment.method,
        reference: input.manualPayment.reference,
        phoneNumber,
        packageId: input.packageId,
        quantity,
        totalKes,
      });

      return {
        checkoutSessionId: conversationId,
        payingPhone: phoneNumber,
        // Nothing was pushed and nothing needs to be — the order is
        // already complete by the time this returns.
        stkPushSent: false,
        pricing: {
          packageLabel: box.name,
          quantity,
          unitPriceKes: box.priceKes,
          subtotalKes,
          discountKes,
          walletCreditAppliedKes,
          deliveryFeeKes: delivery.feeKes,
          totalKes,
          serviceLevel: delivery.method === 'door' ? (stateBlob.serviceLevel ?? 'next-day') : null,
        },
      };
    }

    let stkPushSent = true;
    try {
      await paymentService.initiateAttempt(businessId, intentId, {
        phone: phoneNumber,
        amountKes: totalKes,
        accountReference: `SQ-${conversationId.slice(0, 8)}`,
        // Daraja's documented STK Push limit is 13 characters — 'Snack order' (11) stays under it.
        transactionDesc: 'Snack order',
      });
    } catch {
      // The prompt never reached Daraja. Unlike the WhatsApp path there
      // is no "reply PAY" to retry with, so the conversation goes back
      // to the confirmation step and the payment screen tells the
      // customer to try again — the frozen snapshot stays valid, so a
      // retry re-prices nothing.
      stkPushSent = false;
      await conversationRepository.update(conversationId, { status: 'active' });
    }

    if (input.initiatedBy) {
      // Named on the event, not just in the transcript, so "who took
      // this order" is answerable without reading conversation
      // messages — the same question the audit log exists for.
      await publishEvent(businessId, 'StaffInitiatedCheckout', 'conversation', conversationId, {
        staffUid: input.initiatedBy.staffUid,
        staffName: input.initiatedBy.staffName,
        phoneNumber,
        packageId: input.packageId,
        quantity,
        totalKes,
        stkPushSent,
      });
    }

    return {
      checkoutSessionId: conversationId,
      payingPhone: phoneNumber,
      stkPushSent,
      pricing: {
        packageLabel: box.name,
        quantity,
        unitPriceKes: box.priceKes,
        subtotalKes,
        discountKes,
        walletCreditAppliedKes,
        deliveryFeeKes: delivery.feeKes,
        totalKes,
        serviceLevel: delivery.method === 'door' ? (stateBlob.serviceLevel ?? 'next-day') : null,
      },
    };
  }

  /**
   * The website's delivery branch. Pickup resolves a real station and
   * takes that station's own fee — the same figure the WhatsApp flow
   * reads, from the same collection.
   *
   * Door delivery carries a real fee now. It used to be zero: Bolt's fare was
   * dynamic and per-trip; nobody has quoted it at the moment of
   * checkout, the customer pays the rider directly, and the ride is
   * arranged over WhatsApp afterwards. Charging a made-up figure here
   * would be charging for a service at a price that doesn't exist —
   * so the website bills for the Snack Quest order only, and the
   * shipment is created `pending_manual_booking` exactly as the
   * agent-priced WhatsApp path already produces.
   */
  private async buildWebDeliveryDetails(
    businessId: string,
    county: string,
    input: WebCheckoutInput,
  ): Promise<{ delivery: DeliveryDetails; stateBlob: ConversationStateBlob }> {
    if (input.deliveryMethod === 'pickup') {
      if (!input.pickupStationId) {
        throw new WebCheckoutValidationError('pickupStationId is required for pickup delivery');
      }
      const station = await pickupStationRepository.findById(businessId, input.pickupStationId);
      if (!station || !station.isActive) {
        throw new WebCheckoutValidationError(`Pickup station ${input.pickupStationId} is not available`);
      }
      // A station without a priced zone has an unknown delivery cost. The
      // picker already hides those, but the id arrives from the client,
      // so refusing it here is what actually prevents an order shipping
      // for free — the filter is presentation, this is the rule.
      if (!isFargoZone(station.zone)) {
        throw new WebCheckoutValidationError(
          'We can’t deliver to that pickup station yet — please choose another one.',
        );
      }
      return {
        delivery: {
          method: 'pickup',
          provider: DELIVERY_PROVIDER_FOR_METHOD.pickup,
          status: 'pending',
          shippingOrigin: 'Nairobi',
          feeKes: station.deliveryFeeKes,
          county: station.county ?? county,
          pickupStationId: input.pickupStationId,
          pickupStationName: station.name,
          addressText: null,
          landmark: null,
          estate: null,
          contactPhone: null,
          courierShipmentRef: null,
          // Fargo is booked by hand at a branch, so there is no
          // tracking URL at order time — the waybill number reaches the
          // customer by SMS once the parcel is dropped off.
          trackingUrl: null,
        },
        stateBlob: {
          deliveryMethod: 'pickup',
          pickupStationId: input.pickupStationId,
          pickupStationName: station.name,
          deliveryFeeKes: station.deliveryFeeKes,
        },
      };
    }

    // The door-delivery area is Fargo's "Nairobi and surrounding", which
    // does not follow county lines — see `isMetroLocation`.
    if (!isMetroLocation(county, input.town)) {
      throw new WebCheckoutValidationError(
        // Names the towns rather than saying "and the surrounding
        // towns": a customer cannot tell whether they are in that set,
        // and the vague version already sent one to support asking.
        `Door delivery covers ${metroAreaLabel()} — choose a Fargo pickup point for anywhere else`,
      );
    }
    const addressText = (input.addressText ?? '').trim();
    if (!addressText) {
      throw new WebCheckoutValidationError('addressText is required for door delivery');
    }

    // Same-day is refused rather than silently downgraded once the
    // cut-off has passed. A customer who chose it is buying the 18:00
    // guarantee; quietly charging them for next-day instead would be
    // selling something they did not ask for.
    const requested: FargoServiceLevel = input.serviceLevel === 'same-day' ? 'same-day' : 'next-day';
    if (requested === 'same-day' && !isSameDayAvailableAt()) {
      throw new WebCheckoutValidationError(
        `Same-day delivery closes at ${SAME_DAY_CUTOFF_HOUR}:00 — choose next-day delivery instead.`,
      );
    }

    // Door delivery is charged now. It used to price at zero because
    // Bolt's fare was settled between customer and rider after
    // checkout; Fargo quotes a fixed price, so leaving this at zero
    // would ship every Nairobi order free — the same revenue leak the
    // pickup zones were introduced to close.
    const doorZone = fargoZoneFor('nairobi-metro', requested);
    const doorFeeKes = await deliveryZoneRuleRepository.findFee(
      businessId,
      doorZone,
      FARGO_SHIPPING_ORIGIN,
      FARGO_PACKAGE_CATEGORY,
      DELIVERY_COURIER,
    );
    if (doorFeeKes === null) {
      throw new WebCheckoutValidationError(
        'Door delivery pricing is not configured yet — please choose a pickup point, or contact us.',
      );
    }
    // Optional and validated only if given: the rider calls the paying
    // number when there's no alternate.
    const contactPhone = input.contactPhone?.trim()
      ? normalizeKenyanPhone(input.contactPhone)
      : null;

    return {
      delivery: {
        method: 'door',
        provider: DELIVERY_PROVIDER_FOR_METHOD.door,
        // Still manual: Fargo is booked by hand at a branch, there is
        // just a real price attached to it now.
        status: 'pending_manual_booking',
        shippingOrigin: FARGO_SHIPPING_ORIGIN,
        feeKes: doorFeeKes,
        county,
        pickupStationId: null,
        pickupStationName: null,
        addressText,
        landmark: input.landmark?.trim() || null,
        estate: input.estate?.trim() || null,
        contactPhone,
        courierShipmentRef: null,
        trackingUrl: null,
      },
      stateBlob: {
        deliveryMethod: 'door',
        deliveryFeeKes: doorFeeKes,
        serviceLevel: requested,
        addressText,
        ...(input.estate?.trim() ? { estate: input.estate.trim() } : {}),
        ...(input.landmark?.trim() ? { landmark: input.landmark.trim() } : {}),
        ...(contactPhone ? { contactPhone } : {}),
      },
    };
  }

  /**
   * Prices a website selection without freezing anything or charging
   * anyone (§ Website Becomes the Primary Commerce Channel). The
   * checkout page calls this as the customer builds their order, so the
   * pickup fee, the referral discount and any wallet credit are all
   * visible *before* the M-Pesa prompt rather than appearing for the
   * first time on the payment screen.
   *
   * Shares `resolveWebPricing` with `startWebCheckout` — same catalog
   * read, same station read, same `referralService.validateCode`, same
   * `computeCheckoutTotals`. A quote that didn't match the charge
   * would be worse than no quote at all, so there is no second
   * implementation for it to drift from.
   *
   * Never throws for a bad referral code or an unpriceable delivery
   * choice: a customer half-way through filling a form is expected to
   * be in an incomplete state, and a quote is not the place to reject
   * them. Validation belongs to `startWebCheckout`, which is what
   * actually takes money.
   */
  async quoteWebCheckout(
    businessId: string,
    input: WebCheckoutQuoteInput,
  ): Promise<WebCheckoutQuote | null> {
    const quantity = Math.trunc(input.quantity);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_WEB_CHECKOUT_QUANTITY) {
      return null;
    }

    const box = await packageRepository.findById(businessId, input.packageId);
    if (!box || !box.isActive) {
      return null;
    }

    let deliveryFeeKes = 0;
    if (input.deliveryMethod === 'pickup') {
      if (!input.pickupStationId) {
        // No station chosen yet — quote the box alone rather than
        // refusing to answer. The fee appears the moment they pick one.
        deliveryFeeKes = 0;
      } else {
        const station = await pickupStationRepository.findById(businessId, input.pickupStationId);
        if (!station || !station.isActive) {
          return null;
        }
        deliveryFeeKes = station.deliveryFeeKes;
      }
    } else {
      // Door delivery is priced here too, from the same rule
      // `startWebCheckout` charges from.
      //
      // This branch did not exist while door delivery was Bolt and cost
      // nothing on the site, and not adding it when Tushop started
      // charging is how the checkout came to quote "Free" and then take
      // KES 250 — the exact quote-versus-charge divergence this method
      // exists to prevent.
      const doorFee = await deliveryZoneRuleRepository.findFee(
        businessId,
        fargoZoneFor('nairobi-metro', input.serviceLevel === 'same-day' ? 'same-day' : 'next-day'),
        FARGO_SHIPPING_ORIGIN,
        FARGO_PACKAGE_CATEGORY,
        DELIVERY_COURIER,
      );
      if (doorFee === null) {
        // No configured rate. Falling back to 0 here would quote "Free"
        // for an order `startWebCheckout` is about to refuse as
        // unpriced — the same divergence in the other direction. No
        // quote is the honest answer, and it is what an unavailable
        // station already returns.
        return null;
      }
      deliveryFeeKes = doorFee;
    }

    let referral = input.referralCode
      ? await referralService.validateCode(businessId, input.referralCode)
      : null;
    if (referral) {
      let normalizedPhone: string | null = null;
      try {
        normalizedPhone = input.phone ? normalizeKenyanPhone(input.phone) : null;
      } catch {
        normalizedPhone = null;
      }
      if (
        await isSelfReferral({
          businessId,
          referralOwnerId: referral.ownerId,
          buyerCreatorUid: input.creatorUid,
          buyerPhone: normalizedPhone,
        })
      ) {
        referral = null;
      }
    }

    // Wallet credit needs a real, normalized phone number to look up.
    // Half-typed numbers are the norm here, so a rejection just means
    // "no credit shown yet", never an error.
    let availableWalletCreditKes = 0;
    // The rescue offer's price is already the one-time discount — a
    // referral code is still validated (so the UI can tell the
    // customer it worked) but never reduces this box's price, and
    // neither does the creator discount, same reasoning. Kept in
    // lockstep with the same rule `freezeSnapshot` applies at charge
    // time, so this preview can never promise a discount the actual
    // payment won't honor.
    const creatorDiscountKes = input.isCreatorCheckout ? CREATOR_PACKAGE_DISCOUNT_KES : 0;
    const rawDiscountKes = box.isRescueOffer
      ? 0
      : (referral?.discountKes ?? 0) + creatorDiscountKes;
    if (input.phone) {
      try {
        availableWalletCreditKes = await walletService.redeemableAmount(
          businessId,
          normalizeKenyanPhone(input.phone),
          redeemableCeilingKes(box.priceKes * quantity, rawDiscountKes),
        );
      } catch {
        availableWalletCreditKes = 0;
      }
    }

    /*
     * Priced from the catalogue, the same as the charge is. An extra
     * box that cannot be read, is inactive, or is the primary box
     * repeated is dropped from the quote rather than guessed at — the
     * real checkout refuses those outright, and a quote that priced
     * something the charge will reject is a number the customer can
     * never actually pay.
     */
    const quoteLines: { unitPriceKes: number; quantity: number }[] = [
      { unitPriceKes: box.priceKes, quantity },
    ];
    if (input.items?.length) {
      const seen = new Set([input.packageId]);
      for (const item of input.items) {
        if (item.packageId === input.packageId || seen.has(item.packageId)) continue;
        const count = Math.trunc(item.quantity);
        if (!Number.isFinite(count) || count < 1 || count > MAX_WEB_CHECKOUT_QUANTITY) continue;
        const extra = await packageRepository.findById(businessId, item.packageId);
        if (!extra || !extra.isActive) continue;
        seen.add(item.packageId);
        quoteLines.push({ unitPriceKes: extra.priceKes, quantity: count });
      }
    }

    const totals = computeCheckoutTotals({
      unitPriceKes: box.priceKes,
      quantity,
      ...(quoteLines.length > 1 ? { lines: quoteLines } : {}),
      discountKes: rawDiscountKes,
      walletCreditAppliedKes: availableWalletCreditKes,
      deliveryFeeKes,
    });

    return {
      pricing: {
        packageLabel: box.name,
        quantity,
        unitPriceKes: box.priceKes,
        ...totals,
        serviceLevel: input.deliveryMethod === 'door' ? (input.serviceLevel ?? 'next-day') : null,
      },
      // The customer typed a code; saying whether it worked is the
      // whole point of showing them a quote.
      referralCodeApplied: Boolean(referral),
      referralCodeRejected: Boolean(input.referralCode) && !referral,
    };
  }

  /**
   * The payment screen's poll (§ Website Becomes the Primary Commerce
   * Channel — "the page should automatically detect when payment is
   * complete"). Layers the few order details the success page renders
   * on top of `getOrderStatus`, rather than restating what a payment
   * state means for a second channel.
   */
  async getWebCheckoutStatus(
    businessId: string,
    conversationId: string,
  ): Promise<WebCheckoutStatusResponse> {
    const base = await this.getOrderStatus(businessId, conversationId);

    let deliveryMethod: DeliveryMethod | null = null;
    let customerName: string | null = null;
    let packageLabel: string | null = null;
    // `getOrderStatus`'s totalKes only ever comes from a real Order,
    // which doesn't exist yet while the payment screen is polling —
    // the frozen snapshot's total is what the STK prompt actually asks
    // for in the meantime, and it's the same figure the eventual order
    // gets charged, so it's a safe, accurate stand-in while waiting.
    let totalKes = base.totalKes;
    let guaranteedPicks: { name: string; origin: string | null }[] = [];

    const conversation = await conversationRepository.findById(conversationId);
    if (conversation?.conversationCheckoutSnapshotId) {
      const snapshot = await conversationCheckoutSnapshotRepository.findById(
        conversation.conversationCheckoutSnapshotId,
      );
      if (snapshot) {
        deliveryMethod = snapshot.delivery.method;
        customerName = snapshot.customerName;
        packageLabel = snapshot.packageLabel;
        totalKes ??= snapshot.totalKes;
        guaranteedPicks = (snapshot.guaranteedPicks ?? []).map(({ name, origin }) => ({ name, origin }));
      }
    }

    // The receipt line on the confirmation screen. Read from the order
    // rather than taken as "now", so revisiting the URL a week later
    // still shows when the payment actually happened.
    let paidAt: string | null = null;
    if (base.orderId) {
      const order = await orderRepository.findById(base.orderId);
      const createdAtMs = toMillis(order?.createdAt);
      if (createdAtMs > 0) {
        paidAt = new Date(createdAtMs).toISOString();
      }
    }

    return {
      checkoutSessionId: base.checkoutSessionId,
      paymentStatus: base.paymentStatus,
      orderId: base.orderId,
      orderNumber: base.orderNumber,
      totalKes,
      deliveryMethod,
      customerName,
      packageLabel,
      guaranteedPicks,
      paidAt,
    };
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
        // Resolved here rather than in the state machine, which never
        // touches Firestore. WhatsApp door orders are always next-day —
        // see WHATSAPP_DOOR_SERVICE_LEVEL for why same-day is not
        // offered over a conversation that can sit idle for hours.
        doorDeliveryFeeKes: await deliveryZoneRuleRepository.findFee(
          businessId,
          fargoZoneFor('nairobi-metro', WHATSAPP_DOOR_SERVICE_LEVEL),
          FARGO_SHIPPING_ORIGIN,
          FARGO_PACKAGE_CATEGORY,
          DELIVERY_COURIER,
        ),
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
      /** Unit count. Omitted by every WhatsApp path — a conversation can only ever buy one box. */
      quantity?: number;
      /**
       * Every box on the order, when there is more than one
       * (§ more than one box per order). The subtotal is summed across
       * these; absent, it is `priceKes × quantity` exactly as before.
       */
      items?: CheckoutLineItem[];
      /** The delivery fee is collected by the courier (§ delivery paid on delivery). */
      deliveryFeeCollection?: 'prepaid' | 'on_delivery' | 'waived';
      customerName: string;
      /** Website checkout only; every WhatsApp path omits it. */
      customerEmail?: string | null;
      /**
       * Already validated against the real catalogue by the caller
       * (§ Premium: choose 5, discover the rest) — this only freezes
       * them. Omitted for a fully-curated box and by every WhatsApp
       * path, which cannot offer picks.
       */
      guaranteedPicks?: GuaranteedPick[];
      county: string;
      referralCode?: string;
      /**
       * The exit-intent rescue offer is already a one-time, deeply
       * discounted price — stacking a referral discount (or the
       * creator discount) on top of it would undercut the box's own
       * margin in a way no referral link was priced for. A code still
       * gets validated and recorded (the referring creator is
       * credited normally), it just contributes nothing to the price
       * on this box.
       */
      isRescueOffer?: boolean;
      /** Same server-verified meaning as `WebCheckoutInput.isCreatorCheckout`. */
      isCreatorCheckout?: boolean;
      /** Same server-verified meaning as `WebCheckoutInput.creatorUid`. */
      creatorUid?: string | null;
    },
    delivery: DeliveryDetails,
  ): Promise<{ snapshotId: string; totalKes: number; walletCreditAppliedKes: number; subtotalKes: number; discountKes: number }> {
    let referral = common.referralCode
      ? await referralService.validateCode(businessId, common.referralCode)
      : null;
    if (
      referral &&
      (await isSelfReferral({
        businessId,
        referralOwnerId: referral.ownerId,
        buyerCreatorUid: common.creatorUid,
        buyerPhone: phoneNumber,
      }))
    ) {
      referral = null;
    }

    const quantity = common.quantity ?? 1;
    // Wallet credit is applied on top of any referral discount, capped
    // at what's left of the order after it (§ Phase 4: Customer loyalty
    // / Quest system). Only reserved here; the real debit happens in
    // `completeOrder()`, once payment for this reduced amount has
    // actually succeeded.
    const creatorDiscountKes = common.isCreatorCheckout ? CREATOR_PACKAGE_DISCOUNT_KES : 0;
    const rawDiscountKes = common.isRescueOffer
      ? 0
      : (referral?.discountKes ?? 0) + creatorDiscountKes;
    // The whole order, not just its first line — a wallet ceiling
    // computed from one box of a two-box order would under-redeem the
    // customer's own credit.
    const linesSubtotalKes = common.items?.length
      ? common.items.reduce((sum, line) => sum + line.unitPriceKes * line.quantity, 0)
      : common.priceKes * quantity;
    const availableWalletCreditKes = await walletService.redeemableAmount(
      businessId,
      phoneNumber,
      redeemableCeilingKes(linesSubtotalKes, rawDiscountKes),
    );
    // `computeCheckoutTotals` is the one definition of this arithmetic
    // — shared with `quoteWebCheckout`, so the figure a customer is
    // shown before paying and the figure they are charged cannot
    // disagree.
    const { subtotalKes, discountKes, walletCreditAppliedKes, totalKes } = computeCheckoutTotals({
      unitPriceKes: common.priceKes,
      quantity,
      ...(common.items?.length ? { lines: common.items } : {}),
      ...(common.deliveryFeeCollection
        ? { deliveryFeeCollection: common.deliveryFeeCollection }
        : {}),
      discountKes: rawDiscountKes,
      walletCreditAppliedKes: availableWalletCreditKes,
      deliveryFeeKes: delivery.feeKes,
    });

    const snapshotId = await conversationCheckoutSnapshotRepository.create({
      businessId,
      conversationId,
      customerId,
      phoneNumber,
      packageId: common.packageId,
      packageLabel: common.packageLabel,
      quantity,
      // Absent key rather than `undefined`: Firestore rejects a
      // document containing one outright.
      ...(common.items?.length ? { items: common.items } : {}),
      customerName: common.customerName,
      // Absent key, never `undefined` — Firestore rejects a document
      // containing an undefined value outright, and this field is
      // omitted for every WhatsApp order.
      ...(common.customerEmail ? { customerEmail: common.customerEmail } : {}),
      // Absent rather than `[]` for a curated box: Firestore rejects
      // `undefined` outright, and an empty array would read as "picked
      // nothing" instead of "this box has nothing to pick".
      ...(common.guaranteedPicks?.length ? { guaranteedPicks: common.guaranteedPicks } : {}),
      county: common.county,
      delivery: common.deliveryFeeCollection
        ? {
            ...delivery,
            feeCollection: common.deliveryFeeCollection,
            // A waived fee is genuinely nothing owed, by anyone. Left
            // at its real figure it would show up on the packing list
            // as money to collect at a door where nobody is collecting.
            ...(common.deliveryFeeCollection === 'waived' ? { feeKes: 0 } : {}),
          }
        : delivery,
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

    return { snapshotId, totalKes, walletCreditAppliedKes, subtotalKes, discountKes };
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
  /**
   * Shared by `confirmAndFreeze` and the WhatChimp Bridge API's
   * `bridgeCheckout` — the same `DeliveryDetails` construction either
   * checkout path needs, extracted so the two don't drift out of sync.
   * Pure/no I/O.
   */
  private buildDeliveryDetails(stateBlob: ConversationStateBlob): DeliveryDetails {
    const isPickup = stateBlob.deliveryMethod === 'pickup';
    return isPickup
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
          // Fargo is booked by hand at a branch, so there is no
          // tracking URL at order time — the waybill number reaches the
          // customer by SMS once the parcel is dropped off.
          trackingUrl: null,
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
  }

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

    const delivery = this.buildDeliveryDetails(stateBlob);

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
        isRescueOffer: currentPackage?.isRescueOffer,
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
        // Daraja's documented STK Push limit is 13 characters — 'Snack order' (11) stays under it.
        transactionDesc: 'Snack order',
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
      'Door delivery needs price confirmation:',
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

  // ---------------------------------------------------------------
  // WhatChimp Bridge API (§ WhatChimp Integration Redesign). WhatChimp
  // owns the conversation and its own flow builder now — these methods
  // are the structured, non-text entry points its flow calls at each
  // business-logic checkpoint. Deliberately silent: none of them call
  // `this.reply()` or touch `this.gateway` for a customer-facing
  // message, unlike every method above this point — WhatChimp's own
  // flow renders whatever the customer sees, from the data these
  // return, via its Response Mapping feature. Reuses the exact same
  // repositories/services (`packageRepository`, `pickupStationRepository`,
  // `referralService`, `paymentService`, `buildDeliveryDetails`,
  // `freezeSnapshot`, `escalateToAgent`) the free-text engine above
  // already does — only the entry point changed, not the business
  // logic itself.
  // ---------------------------------------------------------------

  /**
   * The structured equivalent of `startFromCatalogSelection` — same
   * validated-product contract, same conversation bootstrap, but
   * returns the product fields for the caller to shape into its own
   * response instead of sending a WhatsApp reply.
   */
  async bridgeSelectProduct(
    businessId: string,
    phoneNumber: string,
    product: ValidatedCatalogProduct,
    options: StartOptions = {},
  ): Promise<{ conversationId: string; nextStep: ConversationStep }> {
    const existing = await conversationRepository.findActiveByPhoneNumber(businessId, phoneNumber);
    if (existing?.conversation.status === 'agent_assigned') {
      throw new Error(
        `Conversation for ${phoneNumber} is already with a human agent — cannot start a new checkout until that's resolved.`,
      );
    }

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
    } else {
      conversationId = await conversationRepository.create({ businessId, phoneNumber, ...options });
      await publishEvent(businessId, 'ConversationStarted', 'conversation', conversationId, { phoneNumber });
    }

    await conversationRepository.appendMessage(conversationId, {
      direction: 'inbound',
      body: `[WhatChimp product selection] ${product.name}`,
      providerMessageId: null,
    });

    const { nextStep, stateBlobPatch } = bootstrapFromCatalogSelection(product, {
      referralCode: options.referralCode,
    });
    await conversationRepository.updateStep(conversationId, nextStep, stateBlobPatch);

    return { conversationId, nextStep };
  }

  /**
   * The structured equivalent of `awaiting_customer_details` through
   * `awaiting_pickup_station_selection`/`awaiting_door_delivery_details`
   * — driven by fields WhatChimp's own Data Collection already gathered
   * instead of parsed free text. Three shapes of call, matched by which
   * fields are present: (1) `pickupStationId` set — finalize that
   * station; (2) `deliveryMethod: 'door'` with the four address fields
   * set — escalate to a human agent for Bolt pricing, same as the
   * free-text path's `ESCALATE_TO_AGENT`; (3) anything else — search
   * pickup stations (or, for door without address fields yet, just
   * confirm eligibility) and return candidates for WhatChimp to show.
   */
  async bridgeProvideDeliveryDetails(
    businessId: string,
    conversationId: string,
    input: {
      customerName: string;
      county: string;
      deliveryMethod?: 'pickup' | 'door';
      pickupStationId?: string;
      pickupStationSearch?: string;
      addressText?: string;
      landmark?: string;
      estate?: string;
      contactPhone?: string;
    },
  ): Promise<QuoteDeliveryResponse> {
    const conversation = await this.getConversation(businessId, conversationId);
    const isNairobi = isNairobiCounty(input.county);
    const basePatch: Partial<ConversationStateBlob> = {
      customerName: input.customerName,
      county: input.county,
    };

    if (input.deliveryMethod === 'door') {
      if (!isNairobi) {
        throw new Error('Door delivery is only available in Nairobi');
      }
      if (input.addressText && input.landmark && input.estate && input.contactPhone) {
        const finalPatch: Partial<ConversationStateBlob> = {
          ...basePatch,
          deliveryMethod: 'door',
          addressText: input.addressText,
          landmark: input.landmark,
          estate: input.estate,
          contactPhone: input.contactPhone,
        };
        await conversationRepository.updateStep(conversationId, 'awaiting_agent_pricing', finalPatch);
        await this.escalateToAgent(businessId, conversationId, conversation.phoneNumber, {
          ...conversation.stateBlob,
          ...finalPatch,
        });
        return {
          checkoutSessionId: conversationId,
          nextStep: 'awaiting_agent_pricing',
          doorDeliveryEligible: true,
          escalatedToAgent: true,
          pickupStations: [],
          selectedPickupStation: null,
        };
      }
      await conversationRepository.updateStep(conversationId, 'awaiting_door_delivery_details', {
        ...basePatch,
        deliveryMethod: 'door',
      });
      return {
        checkoutSessionId: conversationId,
        nextStep: 'awaiting_door_delivery_details',
        doorDeliveryEligible: true,
        escalatedToAgent: false,
        pickupStations: [],
        selectedPickupStation: null,
      };
    }

    if (input.pickupStationId) {
      const station = await pickupStationRepository.findById(businessId, input.pickupStationId);
      if (!station) {
        throw new Error(`Pickup station ${input.pickupStationId} not found`);
      }
      const finalPatch: Partial<ConversationStateBlob> = {
        ...basePatch,
        deliveryMethod: 'pickup',
        pickupStationId: input.pickupStationId,
        pickupStationName: station.name,
        deliveryFeeKes: station.deliveryFeeKes,
        // The station's own (computed) county is now the authoritative
        // delivery destination — same rule the free-text path applies.
        county: station.county ?? input.county,
      };
      await conversationRepository.updateStep(conversationId, 'awaiting_referral_code', finalPatch);
      return {
        checkoutSessionId: conversationId,
        nextStep: 'awaiting_referral_code',
        doorDeliveryEligible: isNairobi,
        escalatedToAgent: false,
        pickupStations: [],
        selectedPickupStation: {
          id: input.pickupStationId,
          name: station.name,
          deliveryFeeKes: station.deliveryFeeKes,
        },
      };
    }

    const searchText = input.pickupStationSearch ?? input.county;
    const matches = await pickupStationRepository.search(businessId, searchText);
    const options: PickupStationOption[] = matches.map(({ id, data }) => ({
      id,
      name: data.name,
      county: data.county,
      town: data.town,
      deliveryFeeKes: data.deliveryFeeKes,
    }));
    await conversationRepository.updateStep(conversationId, 'awaiting_pickup_station_selection', {
      ...basePatch,
      deliveryMethod: 'pickup',
      pickupStationCandidates: options,
    });
    return {
      checkoutSessionId: conversationId,
      nextStep: 'awaiting_pickup_station_selection',
      doorDeliveryEligible: isNairobi,
      escalatedToAgent: false,
      pickupStations: options,
      selectedPickupStation: null,
    };
  }

  /**
   * The structured equivalent of `awaiting_referral_code` — validates
   * via the same `referralService.validateCode` the freeze-time path
   * re-checks (a code can still expire between this call and payment;
   * this is a preview, not the final word), and returns a computed
   * discount preview instead of a formatted summary message. An
   * invalid/missing code never blocks checkout, same rule as everywhere
   * else this codebase applies it.
   */
  async bridgeApplyReferral(
    businessId: string,
    conversationId: string,
    referralCode: string | null,
  ): Promise<ApplyReferralResponse> {
    const conversation = await this.getConversation(businessId, conversationId);

    let discountKes = 0;
    let valid = false;
    if (referralCode) {
      const referral = await referralService.validateCode(businessId, referralCode);
      if (referral) {
        discountKes = referral.discountKes;
        valid = true;
      }
    }

    const patch: Partial<ConversationStateBlob> = referralCode ? { referralCode } : {};
    await conversationRepository.updateStep(conversationId, 'awaiting_customer_payment_confirmation', patch);

    const mergedStateBlob = { ...conversation.stateBlob, ...patch };
    const subtotalKes = mergedStateBlob.priceKes ?? 0;
    const deliveryFeeKes = mergedStateBlob.deliveryFeeKes ?? 0;
    const totalKes = subtotalKes - discountKes + deliveryFeeKes;

    return {
      checkoutSessionId: conversationId,
      nextStep: 'awaiting_customer_payment_confirmation',
      valid,
      discountKes,
      subtotalKes,
      deliveryFeeKes,
      totalKes,
    };
  }

  /**
   * The structured equivalent of the state machine's `FREEZE_SNAPSHOT`
   * side effect — same price/fee-drift revalidation `confirmAndFreeze`
   * does, same `freezeSnapshot`/`paymentService` calls, but returns the
   * outcome instead of texting the customer. This is the one place
   * either checkout path actually charges — reusing `freezeSnapshot`
   * unchanged means a payment can never be initiated with a stale or
   * caller-supplied price, regardless of which entry point reached it.
   */
  async bridgeCheckout(businessId: string, conversationId: string): Promise<WhatchimpCheckoutResponse> {
    const conversation = await this.getConversation(businessId, conversationId);

    if (conversation.currentStep !== 'awaiting_customer_payment_confirmation') {
      return {
        checkoutSessionId: conversationId,
        status: 'not_ready',
        priceKes: conversation.stateBlob.priceKes ?? 0,
        deliveryFeeKes: conversation.stateBlob.deliveryFeeKes ?? 0,
        totalKes: (conversation.stateBlob.priceKes ?? 0) + (conversation.stateBlob.deliveryFeeKes ?? 0),
      };
    }

    const stateBlob = conversation.stateBlob;
    const isPickup = stateBlob.deliveryMethod === 'pickup';

    const currentPackage = await packageRepository.findById(businessId, stateBlob.packageId ?? '');
    const currentPriceKes = currentPackage?.priceKes ?? stateBlob.priceKes ?? 0;
    let currentDeliveryFeeKes = stateBlob.deliveryFeeKes ?? 0;
    if (isPickup && stateBlob.pickupStationId) {
      const currentStation = await pickupStationRepository.findById(businessId, stateBlob.pickupStationId);
      if (currentStation) {
        currentDeliveryFeeKes = currentStation.deliveryFeeKes;
      }
    }
    const priceDrifted = currentPriceKes !== (stateBlob.priceKes ?? 0);
    const feeDrifted = isPickup && currentDeliveryFeeKes !== (stateBlob.deliveryFeeKes ?? 0);
    if (priceDrifted || feeDrifted) {
      await conversationRepository.updateStep(conversationId, 'awaiting_customer_payment_confirmation', {
        priceKes: currentPriceKes,
        deliveryFeeKes: currentDeliveryFeeKes,
      });
      return {
        checkoutSessionId: conversationId,
        status: 'price_changed',
        priceKes: currentPriceKes,
        deliveryFeeKes: currentDeliveryFeeKes,
        totalKes: currentPriceKes - (stateBlob.discountKes ?? 0) + currentDeliveryFeeKes,
      };
    }

    const delivery = this.buildDeliveryDetails(stateBlob);
    const { snapshotId, totalKes } = await this.freezeSnapshot(
      businessId,
      conversationId,
      conversation.phoneNumber,
      conversation.customerId,
      {
        packageId: stateBlob.packageId ?? '',
        packageLabel: stateBlob.packageLabel ?? '',
        priceKes: stateBlob.priceKes ?? 0,
        customerName: stateBlob.customerName ?? '',
        county: stateBlob.county ?? '',
        referralCode: stateBlob.referralCode,
        isRescueOffer: currentPackage?.isRescueOffer,
      },
      delivery,
    );

    const intentId = await paymentService.createIntent({
      businessId,
      conversationId,
      conversationCheckoutSnapshotId: snapshotId,
      customerId: conversation.customerId,
      phoneNumber: conversation.phoneNumber,
      amountKes: totalKes,
    });

    try {
      await paymentService.initiateAttempt(businessId, intentId, {
        phone: conversation.phoneNumber,
        amountKes: totalKes,
        accountReference: `SQ-${conversationId.slice(0, 8)}`,
        // Daraja's documented STK Push limit is 13 characters — 'Snack order' (11) stays under it.
        transactionDesc: 'Snack order',
      });
    } catch {
      // Same recovery as confirmAndFreeze: STK push never reached
      // Daraja, so return the conversation to the confirmation step —
      // a retry (WhatChimp calling bridgeCheckout again) starts fresh.
      await conversationRepository.update(conversationId, { status: 'active' });
      await conversationRepository.updateStep(conversationId, 'awaiting_customer_payment_confirmation');
      return {
        checkoutSessionId: conversationId,
        status: 'error',
        priceKes: stateBlob.priceKes ?? 0,
        deliveryFeeKes: stateBlob.deliveryFeeKes ?? 0,
        totalKes,
      };
    }

    return {
      checkoutSessionId: conversationId,
      status: 'stk_sent',
      priceKes: stateBlob.priceKes ?? 0,
      deliveryFeeKes: stateBlob.deliveryFeeKes ?? 0,
      totalKes,
    };
  }

  /**
   * Read-only status for a WhatChimp Follow-up Sequence (or a
   * customer-triggered "check status") to poll after `bridgeCheckout`
   * returns `stk_sent` — the async gap the migration plan flags: our
   * backend learns the real payment result from Daraja's callback
   * (`handlePaymentResult`/`completeOrder`), on its own schedule, not
   * from anything WhatChimp calls. `failed` vs `pending` is inferred
   * from whether a snapshot already exists for this conversation
   * (`conversationCheckoutSnapshotId` set) — the same signal
   * `handlePaymentResult`'s failure path itself resets the conversation
   * to, since a genuinely fresh conversation never had one.
   */
  async getOrderStatus(businessId: string, conversationId: string): Promise<OrderStatusResponse> {
    const conversation = await this.getConversation(businessId, conversationId);

    let paymentStatus: OrderPaymentStatus;
    let orderId: string | null = null;
    let totalKes: number | null = null;
    let orderNumber: number | null = null;

    if (conversation.status === 'completed') {
      paymentStatus = 'succeeded';
      const order = await orderRepository.findByConversationId(businessId, conversationId);
      if (order) {
        orderId = order.id;
        totalKes = order.data.pricing.totalKes;
        orderNumber = order.data.orderNumber ?? null;
      }
    } else if (conversation.status === 'abandoned') {
      paymentStatus = 'abandoned';
    } else if (conversation.status === 'awaiting_payment') {
      paymentStatus = 'processing';
    } else if (conversation.status === 'agent_assigned') {
      paymentStatus = 'awaiting_agent';
    } else {
      // 'active' — either never reached checkout yet, or a prior STK
      // attempt failed/mismatched and handlePaymentResult already reset
      // the conversation back here.
      paymentStatus = conversation.conversationCheckoutSnapshotId ? 'failed' : 'pending';
    }

    return {
      checkoutSessionId: conversationId,
      paymentStatus,
      currentStep: conversation.currentStep,
      orderId,
      orderNumber,
      totalKes,
    };
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
      await this.completeOrder(
        businessId,
        result,
        conversation.phoneNumber,
        conversation.attributionSnapshot as ConversionAttribution | null,
      );
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

    // Released above regardless, so the customer can order again. The
    // message is what gets held back on a stale failure: recovery may
    // be settling an attempt abandoned yesterday, and the nightly
    // sweep would deliver "reply PAY to try again" at 2am about
    // something the customer has long since moved on from.
    if (result.status === 'failed' && result.stale) {
      return;
    }

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
   * `snapshot.delivery.provider` names, dispatch ad-conversion events
   * (`attribution` — see `handlePaymentResult`'s caller, which reads
   * it off the `Conversation` before this ever runs, since a Daraja
   * webhook has no browser context of its own to fall back on), notify
   * the admin, and confirm to the customer. Every step past order
   * creation is best-effort — a courier outage or a missing ad
   * platform credential must never undo a paid, confirmed order.
   */
  private async completeOrder(
    businessId: string,
    result: Extract<ProcessCallbackResult, { status: 'succeeded' }>,
    phoneNumber: string,
    attribution: ConversionAttribution | null,
  ): Promise<void> {
    const snapshot = await conversationCheckoutSnapshotRepository.findById(
      result.snapshotId,
    );
    if (!snapshot) {
      return;
    }
    if (snapshot.status === 'completed') {
      // Already turned into an order by an earlier success signal for
      // this same snapshot — a manual reconciliation
      // (§ payment reconciliation: complete manually) and a real Daraja
      // callback can each independently believe they are the one
      // confirming payment. Only the first is allowed to create an
      // order; a second "succeeded" for a snapshot already completed
      // must be a no-op, not a second order for one payment.
      return;
    }

    let orderId: string;
    let orderNumber: number;
    try {
      ({ orderId, orderNumber } = await orderService.createFromConversationSnapshot({
        snapshotId: result.snapshotId,
        snapshot,
        paymentIntentId: result.intentId,
        mpesaReceiptNumber: result.mpesaReceiptNumber,
        manualPayment: result.manualPayment ?? null,
        attribution,
      }));
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
    const orderRef = formatOrderNumber(orderNumber);

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
      attribution,
    });

    // Best-effort, same as everything else past order creation — an
    // analytics miss must never risk a paid, confirmed order. No
    // browser/cookie context exists here (an async Daraja webhook, not
    // a page load — see this function's own doc comment), so
    // `visitorId` is null; `metadata.orderId` is the real join key.
    try {
      const purchasedPackage = await packageRepository.findById(businessId, snapshot.packageId);
      if (purchasedPackage?.isRescueOffer) {
        await analyticsEventService.record(businessId, {
          event: RESCUE_OFFER_EVENTS.purchaseCompleted,
          visitorId: null,
          metadata: { orderId, packageId: snapshot.packageId, amountKes: snapshot.totalKes },
        });
      }
    } catch (error) {
      await publishEvent(businessId, 'AnalyticsEventRecordFailed', 'order', orderId, {
        event: RESCUE_OFFER_EVENTS.purchaseCompleted,
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

    /*
     * Best-effort, like every other call past order creation here.
     * `notifyAdmin` goes out over WhatsApp, and WhatsApp can be
     * switched off in Admin > Settings > Integrations — in which case
     * the gateway throws `IntegrationDisabledError`. An admin courtesy
     * ping is the least important thing this method does; it must not
     * be the thing that fails a paid order.
     */
    try {
      await this.notifications.notifyAdmin(
        businessId,
        `New order ${orderRef}: ${snapshot.packageLabel} — KES ${snapshot.totalKes} — ${snapshot.customerName}, ` +
          `${formatDeliveryLabel(snapshot.delivery)}.`,
      );
    } catch (error) {
      await publishEvent(businessId, 'AdminNotificationFailed', 'order', orderId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

    /*
     * Order confirmation by SMS, alongside — never instead of — the
     * WhatsApp reply below. SMS is the channel that lands even when the
     * customer never opens WhatsApp again, which for a one-off snack
     * purchase is most of them.
     *
     * Best-effort and swallowed, the same discipline as every other
     * call past order creation in this method: the money is collected
     * and the order is real, so a texting failure must never surface as
     * a failed checkout. `NotificationService.send` already records the
     * failure on `outboundMessages` and the retry sweep already picks
     * it up, so nothing is lost by not throwing here.
     *
     * `dedupeKey` is the order id, so a redelivered Daraja callback
     * that re-enters this path cannot text the customer twice.
     */
    /*
     * Not for an order recorded by hand (§ manual confirmation SMS).
     * Those are placed by a staff member who is usually still with the
     * customer — on the phone, or across a stand — so a text firing the
     * instant they hit save is at best redundant and at worst arrives
     * mid-conversation, before the details have been agreed. Staff send
     * it themselves from the order page when the order is actually
     * settled, the same way they created the order itself.
     *
     * The `order-confirmed:{orderId}` key is shared with that button,
     * so whichever path sends first, the customer is texted once.
     */
    try {
      if (!result.manualPayment) {
        await this.notifications.send(businessId, {
          channel: 'sms',
          templateCode: 'order_confirmed_sms',
          recipientType: 'customer',
          recipientId: orderId,
          recipientRef: phoneNumber,
          params: {
            orderRef,
            totalKes: String(snapshot.totalKes),
            paymentRef: formatPaymentReference(result.mpesaReceiptNumber, result.manualPayment),
          },
          dedupeKey: `order-confirmed:${orderId}`,
        });
      }
    } catch (error) {
      await publishEvent(businessId, 'OrderConfirmationSmsFailed', 'order', orderId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }

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
    /*
     * A cash or bank-transfer order has no M-Pesa receipt to quote, so
     * the receipt clause is dropped rather than rendered as an empty
     * "Receipt: ." — the customer is told their payment is recorded,
     * which is the true and useful thing to say.
     */
    const receiptClause = result.mpesaReceiptNumber ? ` Receipt: ${result.mpesaReceiptNumber}.` : '';
    const confirmationMessage =
      snapshot.delivery.method === 'pickup'
        ? `Payment received!${receiptClause} Your order ${orderRef} is confirmed — your Snack Quest box will be curated within 24 hours and handed over to Tushop. We'll text you the waybill number as soon as it is dispatched, and you'll hear from the courier when it reaches your selected pickup point.`
        : `Payment received!${receiptClause} Your order ${orderRef} is confirmed — we're preparing your box and Tushop will bring it to your door.`;

    const milestoneMessage =
      milestoneAwardKes > 0 ? `\n\n🎁 You just earned KES ${milestoneAwardKes} wallet credit — reply BALANCE anytime to check it.` : '';

    /*
     * The last thing this method does, and — until it was fixed — the
     * only call past order creation that could still throw. Everything
     * else here is deliberately best-effort, on the stated principle
     * that a paid, confirmed order is never undone by a downstream
     * failure; the WhatsApp confirmation was the one exception, purely
     * by omission.
     *
     * It matters because WhatsApp can be switched off in
     * Admin > Settings > Integrations, and then the gateway throws
     * `IntegrationDisabledError`. On the Daraja path that surfaced as a
     * failed webhook for an order that had in fact been created; on the
     * staff-initiated path it surfaced as an error dialog in Admin, for
     * an order that had in fact been created. Both told the operator
     * the opposite of the truth.
     *
     * The customer is not left uninformed by swallowing this: the
     * `order_confirmed_sms` above is a separate channel that has
     * already gone out, and it is the one that reaches a customer who
     * never opens WhatsApp again.
     */
    try {
      await this.reply(businessId, result.conversationId, phoneNumber, `${confirmationMessage}${milestoneMessage}`);
    } catch (error) {
      await publishEvent(businessId, 'OrderConfirmationWhatsAppFailed', 'order', orderId, {
        reason: error instanceof Error ? error.message : 'unknown error',
      });
    }
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
    const sendResult = await this.outputSink.send({ businessId, phone: phoneNumber, text });
    await conversationRepository.appendMessage(conversationId, {
      direction: 'outbound',
      body: text,
      providerMessageId: sendResult.providerMessageId,
    });
  }
}

export const conversationService = new ConversationService();
export { ConversationService };

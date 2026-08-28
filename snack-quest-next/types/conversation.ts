import type { FargoServiceLevel } from '@/lib/delivery/deliveryPricing';
import type { Timestamp } from 'firebase/firestore';
import type { DeliveryMethod } from './delivery';

/**
 * `conversations/{conversationId}` — the source of truth for the
 * customer journey (PLATFORM_ARCHITECTURE_V2.md §6). The conversation
 * IS the checkout: there is no cart, no checkout page, no parallel web
 * flow. One document per WhatsApp thread, keyed by phone number.
 */

export type ConversationStatus =
  | 'active'
  | 'awaiting_payment'
  | 'completed'
  | 'abandoned'
  | 'agent_assigned';

/**
 * The deterministic step sequence a purchase conversation moves
 * through. Matches §6's "structured operation with required steps in
 * a partial order" reasoning — a decision tree, not free-form chat.
 * The two delivery methods diverge after `awaiting_delivery_selection`:
 * `pickup` (Fargo) continues through automated pickup-point search/pricing;
 * `door` (Fargo) collects address details, prices them, then escalates to a human only when no rate is configured
 * agent — `awaiting_agent_pricing` is a "parked" step the state
 * machine itself never advances past (see
 * ConversationService.escalateToAgent / priceDoorDelivery). Both
 * methods converge on `awaiting_customer_payment_confirmation` once a
 * real price exists (redesign: customer-controlled STK push) — the
 * STK push is never sent until the customer explicitly replies PAY/
 * PROCEED/CONFIRM from that step, regardless of delivery method.
 */
export type ConversationStep =
  | 'started'
  | 'welcomed'
  | 'awaiting_package_selection'
  | 'awaiting_customer_details'
  | 'awaiting_delivery_selection'
  | 'awaiting_pickup_station_selection'
  | 'awaiting_door_delivery_details'
  | 'awaiting_agent_pricing'
  | 'awaiting_referral_code'
  | 'awaiting_customer_payment_confirmation'
  | 'awaiting_payment_confirmation'
  | 'completed'
  | 'abandoned';

/** A candidate shown to the customer during pickup-station search — carried in `stateBlob` so selection-by-number needs no new lookup. */
export interface PickupStationCandidate {
  id: string;
  name: string;
  county: string | null;
  town: string | null;
  deliveryFeeKes: number;
}

/**
 * The accumulated selections for the in-progress transaction — this
 * IS the "cart," reframed: not a separate collection, just the state
 * of one conversation.
 */
export interface ConversationStateBlob {
  packageId?: string;
  packageLabel?: string;
  priceKes?: number;
  customerName?: string;
  county?: string;
  deliveryMethod?: DeliveryMethod;
  pickupStationId?: string;
  pickupStationName?: string;
  /** Door delivery only — which Fargo speed the customer bought. Absent on pickup orders and on every order predating the field. */
  serviceLevel?: FargoServiceLevel;
  /** Populated from the selected station's zone fee, or from the door zone rule — never fabricated. */
  deliveryFeeKes?: number;
  /** The most recent search results shown to the customer, so replying with a number needs no new Firestore lookup. */
  pickupStationCandidates?: PickupStationCandidate[];
  /** Door-delivery only, collected in one message: address, landmark, estate, phone. */
  addressText?: string;
  landmark?: string;
  estate?: string;
  contactPhone?: string;
  referralCode?: string;
  discountKes?: number;
}

/**
 * What `startWebCheckout` captures from the browser at the moment a
 * website visitor starts checking out (§ close the loop: ad-conversion
 * attribution) — the one point where this app still has the request's
 * cookies/headers in hand, before the actual order confirmation
 * happens asynchronously off a Daraja payment webhook with no browser
 * context at all. Stored once, on `Conversation.attributionSnapshot`,
 * and read back by `AdConversionService.dispatchPurchase` when the
 * order completes.
 *
 * `channel: 'web'` is the field this whole feature hinges on: its
 * presence is what tells `dispatchPurchase` to report the eventual
 * Meta Purchase event with `action_source: 'website'` instead of
 * `'chat'`, and whether to report to TikTok at all — a TikTok ad can
 * only ever have driven a website visit, never a native WhatsApp
 * message, so a conversation with no `attributionSnapshot` never
 * reports to TikTok regardless of `ttclid`.
 */
export interface ConversionAttribution {
  channel: 'web';
  /** The checkout page's URL — Meta's `event_source_url`, TikTok's `page.url`. */
  landingUrl?: string;
  /** TikTok's click id, captured off the landing URL's `?ttclid=` the first time it appeared (§ PageViewTracker.tsx). */
  ttclid?: string;
  /** Meta's click id, same first-touch capture, off `?fbclid=`. Kept raw for display; `fbc` below is the form Meta is actually sent. */
  fbclid?: string;
  /**
   * The same click, formatted as Meta's `fbc` and stamped with when it
   * was observed (§ lib/analytics/metaClickId.ts).
   *
   * This is what reaches the Conversions API. It is stored separately
   * from `fbclid` rather than replacing it because the raw id is what
   * the admin order page shows a human, and because every snapshot
   * written before this existed holds only the raw form.
   */
  fbc?: string;
  /**
   * Meta's `_fbp` browser cookie, set by the Pixel and read straight
   * back off the checkout request.
   *
   * Worth as much as the click id and sometimes more: it identifies the
   * browser to Meta even for a visitor who arrived without any click id
   * at all, which is most of them. Absent when the Pixel never loaded,
   * which on this site's traffic means an in-app browser or a blocker.
   */
  fbp?: string;
  /**
   * The `sq_visitor` cookie, which is the same id every funnel event
   * from this browser already carries (§ close the loop: ad-conversion
   * attribution).
   *
   * Without it an order and the visit that produced it were two
   * unrelated records: `analyticsEvents` knew someone looked at three
   * boxes and abandoned a quote, `orders` knew somebody bought, and
   * nothing joined them. Storing it here is what makes "what did this
   * customer actually do before buying" a question with an answer.
   *
   * Absent on every order placed before this existed, and on any
   * browser that refused the cookie.
   */
  visitorId?: string;
}

export interface Conversation {
  businessId: string;
  phoneNumber: string;
  customerId: string | null;
  status: ConversationStatus;
  currentStep: ConversationStep;
  stateBlob: ConversationStateBlob;
  referralLinkId: string | null;
  attributionSnapshot: Record<string, unknown> | null;
  assignedAgentId: string | null;
  /** Set when status becomes 'agent_assigned' — why a human needs to act (e.g. 'door_delivery_price_confirmation'), so an agent surface never has to guess. */
  escalationReason: string | null;
  conversationCheckoutSnapshotId: string | null;
  startedAt: Timestamp;
  lastMessageAt: Timestamp;
}

export type MessageDirection = 'inbound' | 'outbound';

/** `conversations/{conversationId}/messages/{messageId}` — full transcript. */
export interface ConversationMessage {
  direction: MessageDirection;
  body: string;
  templateCode: string | null;
  providerMessageId: string | null;
  sentAt: Timestamp;
}

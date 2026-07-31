import type { Timestamp } from 'firebase/firestore';

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
 */
export type ConversationStep =
  | 'started'
  | 'welcomed'
  | 'awaiting_package_selection'
  | 'awaiting_customer_details'
  | 'awaiting_delivery_selection'
  | 'awaiting_pickup_station_selection'
  | 'awaiting_referral_code'
  | 'awaiting_order_confirmation'
  | 'awaiting_payment_confirmation'
  | 'completed'
  | 'abandoned';

export type DeliveryMethod = 'door_delivery' | 'jumia_pickup';

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
  /** Populated from the selected station's zone fee — 0 until a real Jumia rate card is entered, never fabricated. */
  deliveryFeeKes?: number;
  /** The most recent search results shown to the customer, so replying with a number needs no new Firestore lookup. */
  pickupStationCandidates?: PickupStationCandidate[];
  addressText?: string;
  referralCode?: string;
  discountKes?: number;
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

/**
 * Request/response contracts for the WhatChimp Bridge API (§ WhatChimp
 * Integration Redesign) — the structured HTTP surface a WhatChimp bot
 * flow calls at each business-logic checkpoint, response-mapping the
 * JSON fields below into whatever it says next. Every endpoint is
 * silent by design: none of them send a WhatsApp message themselves
 * (see `ConversationService`'s `bridge*` methods) — WhatChimp's own
 * flow owns everything the customer actually sees.
 *
 * `checkoutSessionId` is a `conversationId` under a name an external
 * caller doesn't need to know is conversation-shaped — same convention
 * `types/checkout.ts` already established for `/checkout/start|pay`.
 */

export interface SelectProductRequest {
  phoneNumberId: string;
  customerPhone: string;
  productId: string;
  referralCode?: string | null;
  creatorAttributionId?: string | null;
}

export interface SelectProductResponse {
  checkoutSessionId: string;
  nextStep: string;
  productId: string;
  productName: string;
  priceKes: number;
}

export interface QuoteDeliveryRequest {
  checkoutSessionId: string;
  customerName: string;
  county: string;
  deliveryMethod?: 'pickup' | 'door';
  /** A specific station the customer already picked (from a prior search). */
  pickupStationId?: string;
  /** A town/area/county to search pickup stations by — ignored if `pickupStationId` is set. */
  pickupStationSearch?: string;
  /** Required together to finalize door delivery — otherwise the response just confirms door delivery is available and asks for these. */
  addressText?: string;
  landmark?: string;
  estate?: string;
  contactPhone?: string;
}

export interface PickupStationOption {
  id: string;
  name: string;
  county: string | null;
  town: string | null;
  deliveryFeeKes: number;
}

export interface QuoteDeliveryResponse {
  checkoutSessionId: string;
  nextStep: string;
  /** Whether this county qualifies for Fargo door delivery — a pickup point is the only option outside the Nairobi area. */
  doorDeliveryEligible: boolean;
  /** True once a door-delivery order has been handed to a human agent for pricing, which only happens when no Fargo rate is configured — the bot should tell the customer someone will follow up. */
  escalatedToAgent: boolean;
  /** Populated when searching by town/area/county; empty once a station is selected. */
  pickupStations: PickupStationOption[];
  selectedPickupStation: { id: string; name: string; deliveryFeeKes: number } | null;
}

export interface ApplyReferralRequest {
  checkoutSessionId: string;
  /** Omit or send an empty string when the customer has no code — never a fabricated one. */
  referralCode?: string | null;
}

export interface ApplyReferralResponse {
  checkoutSessionId: string;
  nextStep: string;
  /** False for a missing/expired/unknown code — never blocks checkout, matches `referralService.validateCode`'s own "invalid code never blocks a purchase" rule. */
  valid: boolean;
  discountKes: number;
  subtotalKes: number;
  deliveryFeeKes: number;
  totalKes: number;
}

export interface WhatchimpCheckoutRequest {
  checkoutSessionId: string;
}

export type WhatchimpCheckoutStatus = 'stk_sent' | 'price_changed' | 'not_ready' | 'error';

export interface WhatchimpCheckoutResponse {
  checkoutSessionId: string;
  status: WhatchimpCheckoutStatus;
  priceKes: number;
  deliveryFeeKes: number;
  totalKes: number;
}

export type OrderPaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'abandoned' | 'awaiting_agent';

export interface OrderStatusResponse {
  checkoutSessionId: string;
  paymentStatus: OrderPaymentStatus;
  currentStep: string;
  orderId: string | null;
  /** The human-friendly reference (§ order references) — set once `orderId` is, null before that and for the rare pre-existing order that predates this field. */
  orderNumber: number | null;
  totalKes: number | null;
}

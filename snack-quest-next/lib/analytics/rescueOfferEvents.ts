/**
 * The exit-intent rescue offer's funnel event names (§ exit-intent
 * rescue offer) — one literal set shared by the client beacon
 * (`CheckoutForm.tsx`), the public event route
 * (`app/api/analytics/event/route.ts`), and the one server-fired event
 * (`ConversationService.completeOrder`), so none of them can drift to
 * a differently-spelled event name. No other imports — safe for a
 * client component to import directly.
 */
export const RESCUE_OFFER_EVENTS = {
  checkoutStarted: 'rescue_offer_checkout_started',
  purchaseCompleted: 'rescue_offer_purchase_completed',
} as const;

export type RescueOfferEventName = (typeof RESCUE_OFFER_EVENTS)[keyof typeof RESCUE_OFFER_EVENTS];

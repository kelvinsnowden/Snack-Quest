/**
 * The purchase funnel's event names (§ Mission 2 — funnel analytics).
 *
 * Sibling to `rescueOfferEvents.ts`, same contract: one literal set
 * shared by the client beacons that fire them and the server allowlist
 * that accepts them (`services/analyticsEventService.ts`), so neither
 * side can drift to a differently-spelled name. No imports, so a
 * Client Component can import this directly.
 *
 * These four exist because the admin dashboard could previously see a
 * page view and a completed payment and nothing in between: a visitor
 * who reached checkout and left before the M-Pesa prompt left no trace
 * at all. Each event marks one real transition a person makes, never a
 * render — see each constant.
 */
export const FUNNEL_EVENTS = {
  /** A purchase CTA was clicked for a specific box. Intent, not a page view. */
  boxSelected: 'box_selected',
  /** The customer typed into the checkout form for the first time — deliberately not "the page loaded". */
  checkoutFormStarted: 'checkout_form_started',
  /** The pay button was actually submitted, past client validation. Not "the button rendered". */
  paySubmitted: 'pay_submitted',
  /** The server-side quote could not be computed, so the customer saw no live total. */
  quoteError: 'quote_error',
  /** Someone began writing a review — the denominator for "we asked, did they actually do it". */
  reviewStarted: 'review_started',
  /** A review was successfully submitted (it still has to pass moderation to appear). */
  reviewSubmitted: 'review_submitted',
} as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

/**
 * Where a `box_selected` came from. A closed set rather than free text
 * so the admin side can group by it without normalising strings, and
 * so a typo shows up as a missing source rather than a new one.
 */
export type BoxSelectedSource =
  | 'home_hero'
  | 'home_pick_your_box'
  | 'home_final_cta'
  | 'header'
  | 'product_page'
  | 'product_page_comparison'
  | 'checkout_picker'
  | 'blog'
  | 'about'
  | 'how_it_works'
  | 'creator_offers';

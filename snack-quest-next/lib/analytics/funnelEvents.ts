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
  /**
   * A WhatsApp ordering CTA was opened — real purchase intent leaving
   * for a thread (§ order on WhatsApp).
   *
   * Until this existed, every WhatsApp CTA on the site was a plain
   * `<a>` that recorded nothing, so a visitor who chose to buy in chat
   * looked identical in the data to one who simply left. With a real
   * ordering path in place that blind spot would be the largest one
   * in the funnel — the channel the owner believes converts best would
   * be the only channel with no numbers at all.
   *
   * Marks the hand-off, never the sale: what happens in the thread is
   * invisible from here, and an order taken there is recorded when
   * staff enter it by hand.
   */
  whatsappOrderStarted: 'whatsapp_order_started',
} as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

/**
 * Where a `box_selected` came from. A closed set rather than free text
 * so the admin side can group by it without normalising strings, and
 * so a typo shows up as a missing source rather than a new one.
 */
/**
 * Where a `whatsapp_order_started` came from. Separate from
 * `BoxSelectedSource` on purpose: the two paths do not sit on the same
 * surfaces, and a shared union would quietly permit sources that
 * cannot occur — the point of a closed set is that an impossible value
 * fails to compile.
 */
export type WhatsAppOrderSource =
  | 'checkout_form'
  | 'mobile_sticky_bar'
  | 'home_pick_your_box'
  | 'product_page';

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

/**
 * Every figure the investor page states, in one module
 * (§ investor interest page).
 *
 * Deliberately not spread across the components that render them. The
 * raise moved from KSh 5M to KSh 6M and the old number survived in the
 * decks in six places — a table total, a payback note, a metadata
 * description, a slide stamp — because each was written where it was
 * shown. Here the total is *computed* from the allocations, so a
 * figure and its breakdown cannot disagree, and `investRaise.test.ts`
 * fails if they ever do.
 *
 * Nothing in here is estimated. Sales and revenue are counted from the
 * production `orders` collection under the same definition the admin
 * analytics uses; the TikTok figures are the ones TikTok reports for
 * @snackquests, with the window each was measured over named beside
 * it. Anything that could not be verified is absent rather than
 * approximated — see `TRACTION_AS_OF`.
 */

/** No `Intl` and no locale surprises: these are Kenyan shillings, printed one way. */
export function formatKsh(amount: number): string {
  return `KSh ${amount.toLocaleString('en-KE')}`;
}

/**
 * How the raise is spent, in the order it is argued: the stock first,
 * because the assortment is the product; the room it sits in; the
 * months to trade through; then the demand and the content engine that
 * fill it.
 */
export interface Allocation {
  /** Stable, used as a React key and an anchor — never re-ordered meaning. */
  id: string;
  amountKes: number;
  label: string;
  body: string;
}

export const ALLOCATIONS: readonly Allocation[] = [
  {
    id: 'stock',
    amountKes: 2_500_000,
    label: 'Imported Stock',
    body: 'Build the opening product assortment and maintain enough inventory to create a compelling discovery experience. The assortment is the product — a shelf that is half empty is not a destination.',
  },
  {
    id: 'store',
    amountKes: 1_000_000,
    label: 'Store Fit-out + Deposit',
    body: 'Create the first physical Snack Quest discovery destination: the deposit, the build, the lighting and the fixtures that make the room worth walking into.',
  },
  {
    id: 'working-capital',
    amountKes: 1_500_000,
    label: 'Working Capital',
    body: 'The operating runway to establish Store #1 and prove repeatable economics — rent, salaries and the everyday cost of trading while the store finds its customers.',
  },
  {
    id: 'acquisition',
    amountKes: 800_000,
    label: 'Customer Acquisition & Launch Marketing',
    body: 'Drive awareness, store traffic, online orders, creator activity and customer acquisition around the launch. A shop nobody has heard of is a stockroom.',
  },
  {
    id: 'studio',
    amountKes: 200_000,
    label: 'Content & Commerce Studio',
    body: 'Equipment for product photography, product video, TikTok and Reels, livestreaming, social commerce and creator collaborations — the engine that turns the shelf into content, continuously.',
  },
] as const;

/**
 * Computed, never typed twice. The headline and the table are the same
 * number by construction.
 */
export const RAISE_TOTAL_KES = ALLOCATIONS.reduce((sum, item) => sum + item.amountKes, 0);

/** "KSh 6M" — the short form, derived so it cannot outlive the total. */
export const RAISE_HEADLINE = `KSh ${RAISE_TOTAL_KES / 1_000_000}M`;

/**
 * What the money is for, in one sentence, used by the hero, the
 * metadata and the FAQ so all three say the same thing.
 */
export const RAISE_PURPOSE = 'To open Store #1 — and build the engine around it.';

/**
 * The date every trading figure below was counted on.
 *
 * Stated on the page beside the numbers rather than left implicit. A
 * metric with no date is a claim; a metric with a date is a
 * measurement, and an investor can ask us to re-run it.
 */
export const TRACTION_AS_OF = '18 September 2026';

/**
 * Counted from the production `orders` collection on the date above,
 * under the definition the admin analytics uses: status `confirmed`,
 * `dispatched` or `delivered`, excluding pay-on-delivery and excluding
 * comped orders with a zero total.
 */
export const TRACTION = {
  paidOrders: 22,
  revenueKes: 93_650,
  /** Distinct paying customers behind those orders. */
  customers: 22,
  /** Published reviews and their mean rating. */
  reviewCount: 11,
  reviewAverage: 4.73,
  /** Active boxes in the catalogue, and the snack range behind them. */
  snackCatalogue: 62,
} as const;

/** Derived, so it can never contradict the two numbers it comes from. */
export const AVERAGE_ORDER_KES = Math.round(TRACTION.revenueKes / TRACTION.paidOrders);

/**
 * TikTok's own reported figures for @snackquests.
 *
 * Two different windows, kept apart on purpose. `profileViewsToDate`
 * and `sharesToDate` are running totals; the screenshot in
 * `public/deck/shot-ttmetrics.webp` is a 28-day window that ended on
 * 25 August, and its numbers are lower precisely because it is a
 * window. Printing one set under the other without saying so is how a
 * deck ends up contradicting itself in front of the person reading it.
 */
export const TIKTOK = {
  handle: '@snackquests',
  profileViewsToDate: '10.5K',
  sharesToDate: 562,
  screenshot: {
    src: '/deck/shot-ttmetrics.webp',
    window: '29 July – 25 August 2026',
    postViews: '177.8K',
    likes: '11.4K',
    comments: 144,
    shares: 278,
  },
} as const;

/**
 * The recorded founder presentation.
 *
 * A named constant, and the only place the URL lives, because it is
 * the one thing on this page that changes without a code change being
 * interesting — someone pastes a link. Empty means "not published
 * yet", which the hero renders as a designed waiting state rather than
 * a broken player; see `InvestorVideo`.
 *
 * Paste whatever link is to hand: a Google Drive share URL, a YouTube
 * or Vimeo link in any of their forms, or a direct `.mp4`.
 * `resolveVideoSource` maps it to something a browser will actually
 * play — the share URL Drive and YouTube give you cannot be framed as
 * copied, and fails as a blank rectangle rather than an error.
 *
 * A direct file gets a real `<video>`, which is the only case where
 * play and completion can be observed; everything else is an iframe.
 * Whichever it is, it must never autoplay with sound.
 */
export const INVESTOR_VIDEO_URL =
  'https://drive.google.com/file/d/1_axgWZ4cGBYYiqW021ChzD9ODfR-SzGi/view?usp=drive_link';

/** Shown under the player before the video plays. A real frame, not a black box. */
export const INVESTOR_VIDEO_POSTER = '/deck/shot-founder.webp';

/**
 * The non-binding language, written once.
 *
 * This page collects interest, never money, and nothing on it may read
 * as an offer of securities. Holding the wording here means the
 * disclaimer under the form, the FAQ answer and the metadata cannot
 * drift into three different promises.
 */
export const INTEREST_DISCLAIMER =
  'Submitting this form is a non-binding expression of interest and does not constitute an offer, acceptance, commitment to invest, or purchase of securities. Any future investment opportunity will be subject to applicable legal, regulatory and transaction documentation.';

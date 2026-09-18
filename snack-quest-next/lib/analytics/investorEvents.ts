/**
 * The investor page's funnel (§ investor interest page).
 *
 * Same contract as `funnelEvents.ts`: one literal set shared by the
 * client beacons that fire them and the server allowlist that accepts
 * them, so neither side can drift to a differently-spelled name. No
 * imports, so a Client Component can import this directly.
 *
 * This page has exactly one conversion and several ways to arrive at
 * it, which is why the video and the read-instead path are tracked
 * separately: if the people who submit are overwhelmingly the ones who
 * never pressed play, the video is not doing the job it was made for,
 * and nothing else on the page would reveal that.
 */
export const INVESTOR_EVENTS = {
  /** The founder video was started. Intent to watch, not a render. */
  videoPlayed: 'investor_video_played',
  /** The video reached its end — only observable for a self-hosted file. */
  videoCompleted: 'investor_video_completed',
  /** "Prefer reading?" — someone choosing the written story over the video. */
  readInstead: 'investor_read_instead',
  /** An investor CTA was clicked, from wherever on the page. */
  ctaClicked: 'investor_cta_clicked',
  /** The first keystroke in the interest form — deliberately not "the form rendered". */
  formStarted: 'investor_form_started',
  /** The form was submitted past client validation. */
  formSubmitted: 'investor_form_submitted',
  /** The server accepted it and the success state was shown. */
  formCompleted: 'investor_form_completed',
  /** Someone left for the shop, which is its own kind of interest. */
  exploreClicked: 'investor_explore_clicked',
} as const;

export type InvestorEventName = (typeof INVESTOR_EVENTS)[keyof typeof INVESTOR_EVENTS];

/**
 * Which CTA a click came from. A closed set rather than free text, for
 * the same reason `BoxSelectedSource` is one: a typo should show up as
 * a missing source, not a new one.
 */
export type InvestorCtaSource = 'nav' | 'hero' | 'raise' | 'mobile_bar' | 'final';

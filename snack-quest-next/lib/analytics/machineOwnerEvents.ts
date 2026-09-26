/**
 * The `/own` machine-owner landing page's funnel (§ machine-owner
 * lead-generation landing page). Same contract as
 * `investorEvents.ts` — one literal set shared by the client beacons
 * that fire them and the server allowlist that accepts them.
 */
export const MACHINE_OWNER_EVENTS = {
  /** An "Apply" CTA was clicked, from wherever on the page. */
  ctaClicked: 'machine_owner_cta_clicked',
  /** The first keystroke/selection in the application form. */
  formStarted: 'machine_owner_form_started',
  /** The form was submitted past client validation. */
  formSubmitted: 'machine_owner_form_submitted',
  /** The server accepted it and the success state was shown. */
  formCompleted: 'machine_owner_form_completed',
} as const;

export type MachineOwnerEventName = (typeof MACHINE_OWNER_EVENTS)[keyof typeof MACHINE_OWNER_EVENTS];

/** Which CTA a click came from — a closed set for the same reason `InvestorCtaSource` is one. */
export type MachineOwnerCtaSource = 'nav' | 'hero' | 'qualification' | 'mobile_bar' | 'final';

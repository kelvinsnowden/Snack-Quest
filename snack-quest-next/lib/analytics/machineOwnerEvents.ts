/**
 * The `/own` machine-owner landing page's funnel (§ machine-owner
 * lead-generation landing page, interactive qualification form). Same
 * contract as `investorEvents.ts` — one literal set shared by the
 * client beacons that fire them and the server allowlist that accepts
 * them.
 *
 * Named per-step so a drop-off is visible at the exact question it
 * happened on, not just "the form" as one opaque box — the whole
 * point of a multi-step form is knowing which step is costing leads.
 */
export const MACHINE_OWNER_EVENTS = {
  /** An "Apply" CTA was clicked, from wherever on the page. */
  ctaClicked: 'machine_owner_cta_clicked',
  /** The form actually opened — the first step rendered. */
  formStarted: 'machine_owner_form_started',
  /** Name entered and the applicant moved past the greeting screen. */
  nameCompleted: 'machine_owner_name_completed',
  /** A capital range card was chosen. */
  capitalSelected: 'machine_owner_capital_selected',
  /** A location-access card was chosen. */
  locationAccessSelected: 'machine_owner_location_access_selected',
  /** The location-type step was completed (selections may be empty). */
  locationTypeSelected: 'machine_owner_location_type_selected',
  /** An owner-profile ("what are you looking to build") card was chosen. */
  interestSelected: 'machine_owner_interest_selected',
  /** The contact step (WhatsApp/email) was reached. */
  contactStarted: 'machine_owner_contact_started',
  /** The server accepted the application and the success state was shown. */
  applicationSubmitted: 'machine_owner_application_submitted',
  /** The visitor left the form before finishing — fired on unmount with the step they were on. */
  formAbandoned: 'machine_owner_form_abandoned',
} as const;

export type MachineOwnerEventName = (typeof MACHINE_OWNER_EVENTS)[keyof typeof MACHINE_OWNER_EVENTS];

/** Which CTA a click came from — a closed set for the same reason `InvestorCtaSource` is one. */
export type MachineOwnerCtaSource = 'nav' | 'hero' | 'qualification' | 'mobile_bar' | 'final';

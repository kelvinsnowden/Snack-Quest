/**
 * The checkout as a guided journey rather than one long form
 * (§ checkout redesign).
 *
 * One page, one `<form>`, one submit — the stages are which section is
 * on screen, not separate routes. That matters: the quote, the
 * validation, the gift block and the codes all read from a single
 * piece of state, and splitting them across navigations would mean
 * carrying that state through a URL or rebuilding it on each step.
 *
 * The stage list is derived per box rather than fixed. A box with no
 * guaranteed picks has nothing to choose, so it genuinely has three
 * stages, and showing a greyed-out "your snacks" it will never reach
 * would be a progress bar that lies about the length of the journey.
 */

export type CheckoutStage = 'box' | 'snacks' | 'details' | 'delivery';

export interface StageDefinition {
  id: CheckoutStage;
  /** In the progress indicator, and in the button that leads to it. */
  label: string;
  /** Lower-case, for mid-sentence use like "Continue to your snacks". */
  shortLabel: string;
}

const DEFINITIONS: Record<CheckoutStage, StageDefinition> = {
  box: { id: 'box', label: 'Your box', shortLabel: 'your box' },
  snacks: { id: 'snacks', label: 'Your snacks', shortLabel: 'your snacks' },
  details: { id: 'details', label: 'Your details', shortLabel: 'your details' },
  delivery: { id: 'delivery', label: 'Delivery & pay', shortLabel: 'delivery' },
};

/**
 * The stages this order actually has.
 *
 * `hasPicks` comes from the chosen box, so switching from a box that
 * offers picks to one that does not shortens the journey — which is
 * the honest thing for the indicator to show.
 */
export function stagesFor(hasPicks: boolean): StageDefinition[] {
  const ids: CheckoutStage[] = hasPicks
    ? ['box', 'snacks', 'details', 'delivery']
    : ['box', 'details', 'delivery'];
  return ids.map((id) => DEFINITIONS[id]);
}

/**
 * Which stage a given validation problem belongs to.
 *
 * Keyed by the input's id, the same key the field-level messages use,
 * so a problem can be shown under its field *and* block the stage that
 * owns it without the two ever disagreeing about which stage that is.
 *
 * Anything unrecognised falls to the last stage. That is the safe
 * direction: an unknown problem stops the payment rather than being
 * skipped past on the way to it.
 */
export function stageForField(field: string): CheckoutStage {
  if (field === 'checkout-box') return 'box';
  if (field === 'checkout-picks') return 'snacks';
  if (field === 'checkout-name' || field === 'checkout-phone' || field === 'checkout-email') {
    return 'details';
  }
  return 'delivery';
}

/**
 * The button that leaves a stage.
 *
 * Named after the stage it actually leads to, read from the list
 * rather than fixed per stage. Hard-coding it said "continue to
 * snacks" on a box that has no snacks to choose — the button promised
 * a step the journey does not contain.
 *
 * The last stage does not advance, it pays, and it names the amount: a
 * customer should never have to combine the figure in the summary with
 * the verb on the button to work out what pressing it costs.
 */
export function advanceLabelFor(
  nextStage: StageDefinition | undefined,
  formattedTotal: string | null,
): string {
  if (!nextStage) {
    return formattedTotal ? `Pay ${formattedTotal} with M-Pesa` : 'Pay with M-Pesa';
  }
  return `Continue to ${nextStage.shortLabel}`;
}

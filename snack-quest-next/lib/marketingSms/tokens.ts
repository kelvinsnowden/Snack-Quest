import { renderTemplate } from '@/lib/notifications/renderTemplate';

/**
 * The `{{token}}` merge tags a marketing SMS may use.
 *
 * Same syntax as `notificationTemplates` deliberately — one templating
 * language across the product, so somebody who has edited a transaction
 * template already knows this one. It reuses `renderTemplate` rather
 * than reimplementing substitution.
 *
 * What it does NOT reuse is that function's behaviour on an unknown
 * token: `renderTemplate` leaves `{{whatever}}` in place, which is the
 * right call for a seeded template that a developer wrote and a test
 * covers. Here the author is a person typing into a box minutes before
 * spending money, and a mistyped `{{firstname}}` would be delivered
 * literally to every customer on the list. So the body is validated
 * against this list before anything sends, and an unknown tag is a
 * refusal rather than a silent pass-through.
 */
export const SMS_TOKENS = {
  firstName: {
    token: '{{firstName}}',
    label: 'First name',
    help: 'The customer’s first name, from their most recent order.',
  },
  offer: {
    token: '{{offer}}',
    label: 'Offer',
    help: 'The offer text you set below — e.g. “15% off your next box”.',
  },
  link: {
    token: '{{link}}',
    label: 'Link',
    help: 'The web address you set below.',
  },
} as const;

export type SmsTokenName = keyof typeof SMS_TOKENS;

export const SMS_TOKEN_NAMES = Object.keys(SMS_TOKENS) as SmsTokenName[];

/**
 * A customer with no name on file falls back to this rather than to an
 * empty string or the literal "Guest" that `CustomerService` uses
 * internally. "Hey there" is a greeting; "Hey Guest" and "Hey " are
 * both worse than not personalising at all.
 */
export const FIRST_NAME_FALLBACK = 'there';

/** Every `{{tag}}` in a body, in order of appearance, including misspelled ones. */
export function extractTokens(body: string): string[] {
  return Array.from((body ?? '').matchAll(/\{\{(\w+)\}\}/g)).map((match) => match[1]);
}

export interface TokenValidationInput {
  bodyText: string;
  linkUrl: string | null;
  offerText: string | null;
}

/**
 * Returns a human-readable problem, or `null` when the body is safe to
 * send. Deliberately returns one message at a time: this surfaces in a
 * compose box, and a list of five faults is read as a wall rather than
 * as an instruction.
 */
export function validateTokens({ bodyText, linkUrl, offerText }: TokenValidationInput): string | null {
  const used = extractTokens(bodyText);

  const unknown = used.find((name) => !SMS_TOKEN_NAMES.includes(name as SmsTokenName));
  if (unknown) {
    // Case is the likeliest slip — {{firstname}} for {{firstName}} — so
    // the message names the correction rather than just the rule.
    const caseMatch = SMS_TOKEN_NAMES.find((name) => name.toLowerCase() === unknown.toLowerCase());
    return caseMatch
      ? `“{{${unknown}}}” isn’t a tag — did you mean “{{${caseMatch}}}”? Tags are case-sensitive.`
      : `“{{${unknown}}}” isn’t a tag. You can use ${SMS_TOKEN_NAMES.map((n) => `{{${n}}}`).join(', ')}.`;
  }

  if (used.includes('link') && !linkUrl?.trim()) {
    return 'Your message uses {{link}}, so you need to set the web address it points to.';
  }
  if (used.includes('offer') && !offerText?.trim()) {
    return 'Your message uses {{offer}}, so you need to say what the offer is.';
  }

  return null;
}

export interface TokenValues {
  firstName: string | null;
  linkUrl: string | null;
  offerText: string | null;
}

/** Substitutes one recipient's values into a validated body. */
export function renderSmsBody(bodyText: string, values: TokenValues): string {
  return renderTemplate(bodyText, {
    firstName: firstNameOf(values.firstName),
    offer: values.offerText?.trim() ?? '',
    link: values.linkUrl?.trim() ?? '',
  });
}

/**
 * "Jane Wanjiru" → "Jane". Trimmed to the first word because a marketing
 * greeting uses a first name, and because `CustomerService` stores
 * whatever the customer typed at checkout — which is often a full name
 * and sometimes a placeholder.
 */
export function firstNameOf(customerName: string | null | undefined): string {
  const first = (customerName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first || first.toLowerCase() === 'guest') {
    return FIRST_NAME_FALLBACK;
  }
  return first;
}

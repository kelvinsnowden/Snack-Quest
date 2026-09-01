/**
 * Kenyan MSISDN normalization for the website checkout (§ Website
 * Becomes the Primary Commerce Channel). WhatsApp checkouts never
 * needed this — the phone number arrived from the BSP already in
 * international form — but a customer typing into a form will write
 * `0712 345 678`, `+254712345678`, or `254712345678` interchangeably,
 * and Daraja only accepts the last of those.
 *
 * Deliberately strict rather than best-effort: an STK push sent to a
 * mis-normalized number charges a stranger, so anything that isn't
 * unambiguously a Kenyan mobile number is rejected for the customer to
 * correct, never guessed at.
 */

/** Safaricom, Airtel, and Telkom mobile prefixes are all `7…` or `1…` after the country code. */
const KE_MOBILE = /^254[71]\d{8}$/;

export class InvalidPhoneNumberError extends Error {
  constructor(raw: string) {
    super(`'${raw}' is not a valid Kenyan mobile number`);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Returns the number in the `2547XXXXXXXX` form Daraja and WhatsApp
 * both use, or throws. Spaces, dashes, brackets and a leading `+` are
 * stripped first — they're formatting, not digits.
 */
export function normalizeKenyanPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');

  let normalized = digits;
  if (digits.startsWith('0')) {
    // Local form: 0712345678 → 254712345678.
    normalized = `254${digits.slice(1)}`;
  } else if (digits.length === 9 && /^[71]/.test(digits)) {
    // Bare subscriber number, no trunk prefix: 712345678.
    normalized = `254${digits}`;
  }

  if (!KE_MOBILE.test(normalized)) {
    throw new InvalidPhoneNumberError(raw);
  }
  return normalized;
}

/** Non-throwing variant for form-level validation, where a boolean reads better than a try/catch. */
export function isValidKenyanPhone(raw: string): boolean {
  try {
    normalizeKenyanPhone(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * The number as a person reads it, from whatever they typed
 * (§ checkout second pass).
 *
 * `0712 345 678` — the grouping every Kenyan sees on their own handset.
 * Deliberately a *display* concern only: `normalizeKenyanPhone` above
 * stays strict and unchanged, because the number that reaches Daraja
 * decides who gets charged, and a formatter that guessed would be
 * guessing about somebody's money.
 *
 * Formats progressively rather than only when complete, so the shape
 * appears as the customer types and they can see their own mistake at
 * the digit they made it, rather than after leaving the field.
 */
export function formatKenyanPhoneInput(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');

  /*
   * International input keeps its `+254 ` prefix rather than being
   * silently rewritten to `07…`. Someone who typed a country code
   * meant to, and watching the form rewrite it is unsettling in a way
   * that reformatting their own local number is not.
   */
  if (raw.trim().startsWith('+') || digits.startsWith('254')) {
    const subscriber = digits.replace(/^254/, '').slice(0, 9);
    const grouped = [subscriber.slice(0, 3), subscriber.slice(3, 6), subscriber.slice(6, 9)]
      .filter(Boolean)
      .join(' ');
    return grouped ? `+254 ${grouped}` : '+254 ';
  }

  // Local form. Ten digits, grouped 4-3-3 the way the keypad shows it.
  const local = digits.slice(0, 10);
  return [local.slice(0, 4), local.slice(4, 7), local.slice(7, 10)].filter(Boolean).join(' ');
}

/**
 * The number as a hint rather than a fact: `2547•••••678`.
 *
 * Shown on the payment screen so a customer waiting on a prompt can
 * check it went to the right phone — the first thing they ask when it
 * has not arrived. Masked because that URL is shareable, and
 * recognising your own number needs far less than all of it.
 */
export function maskPhone(normalized: string): string {
  const digits = (normalized ?? '').replace(/\D/g, '');
  if (digits.length < 7) {
    return '';
  }
  return `${digits.slice(0, 4)}•••••${digits.slice(-3)}`;
}

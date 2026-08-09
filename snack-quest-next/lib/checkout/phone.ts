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

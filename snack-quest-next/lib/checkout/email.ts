/**
 * Customer email at checkout (§ optional email capture).
 *
 * Optional everywhere, by design. Every order this business takes is
 * reachable by phone — that is the identifier WhatsApp, the STK prompt
 * and the delivery SMS all run on — so an address is an extra, never a
 * gate. A checkout that refused to proceed without one would trade
 * real revenue for a mailing list.
 *
 * Validation is deliberately shallow. The only thing worth catching
 * here is a typo the customer can still fix, and the only reliable
 * test of an address is sending to it. A stricter pattern rejects
 * legitimate addresses (plus tags, new TLDs, non-ASCII locals) far
 * more often than it catches a real mistake.
 */

/** Something before an @, something after it, and a dot in the domain. Everything past that is the mail server's job. */
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Long enough for any real address; short enough that a paste accident cannot become a stored document field. */
const MAX_LENGTH = 254;

/** Trimmed and lowercased, or `null` for anything that is not usable. Never throws — an absent address is a normal outcome, not an error. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_LENGTH || !SHAPE.test(value)) {
    return null;
  }
  return value;
}

/**
 * Whether what the customer has typed so far is a usable address.
 *
 * Blank counts as valid: the field is optional, so an empty one is a
 * complete answer rather than an unfinished one. Only a non-empty
 * value that cannot be an address is worth flagging.
 */
export function isAcceptableEmailInput(raw: string): boolean {
  return raw.trim().length === 0 || normalizeEmail(raw) !== null;
}

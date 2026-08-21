import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The opt-out link carried by every marketing SMS.
 *
 * A link rather than "reply STOP", because replying is not possible:
 * the sender ID is alphanumeric (the promotional ID at launch, a
 * branded one later), and alphanumeric sender IDs are one-way — a
 * customer's reply has nowhere to go. "Reply STOP" printed on a message
 * nobody can reply to is worse than no opt-out at all, since it looks
 * like a working choice. If the business later buys a real short code,
 * `SmsOptOutSource` already has `'inbound_reply'` waiting for it.
 *
 * The token is signed, not opaque, so there is no token→phone lookup
 * table to keep: the number travels in the token and the HMAC proves it
 * was issued by us. Without a signature, `?phone=` would let anyone
 * enumerate the register and opt out numbers that are not theirs.
 *
 * Length is a real cost here in a way it never is for email — every
 * character shares a 160-character SMS segment with the message itself,
 * so the encoding is kept as tight as it can be while staying
 * tamper-evident: the subscriber digits without the `254` prefix, plus
 * a 10-character signature.
 */

/** Truncated deliberately. A full SHA-256 is 64 hex characters — most of an SMS segment spent proving a phone number that is already only nine digits. 8 characters is 32 bits: far beyond forging by hand, and the only thing a successful forgery buys is unsubscribing someone who can resubscribe by ordering again. */
const SIGNATURE_LENGTH = 8;

/**
 * Short on purpose, and the reason this is not `/sms/stop/`. The path
 * is paid for out of the same 160-character segment as the message: at
 * `/sms/stop/` the whole suffix ran to 60 characters, 37% of a segment,
 * which is enough to push an ordinary campaign into a second segment
 * and double what it costs to send. `/s/` gets the same job done in
 * three.
 */
const OPT_OUT_PATH = '/s/';

export class SmsOptOutSecretMissingError extends Error {
  constructor() {
    super(
      'SMS_OPTOUT_SECRET is not configured — refusing to build an opt-out link. A marketing SMS must never go out with a link that cannot be honoured.',
    );
    this.name = 'SmsOptOutSecretMissingError';
  }
}

function getSecret(): string {
  const secret = process.env.SMS_OPTOUT_SECRET;
  if (!secret) {
    throw new SmsOptOutSecretMissingError();
  }
  return secret;
}

function sign(subscriberDigits: string, secret: string): string {
  return createHmac('sha256', secret).update(subscriberDigits).digest('hex').slice(0, SIGNATURE_LENGTH);
}

/** `254712345678` → `712345678`. The country code is constant for every number this business can text, so spending three characters of every SMS on it would be waste. */
function toSubscriberDigits(phoneNumber: string): string {
  return phoneNumber.startsWith('254') ? phoneNumber.slice(3) : phoneNumber;
}

function fromSubscriberDigits(subscriberDigits: string): string {
  return `254${subscriberDigits}`;
}

/** `712345678` + signature. Callers pass an already-normalised `254…` number — `normalizeKenyanPhone` is the single place that validation lives. */
export function buildOptOutToken(phoneNumber: string): string {
  const digits = toSubscriberDigits(phoneNumber);
  return `${digits}${sign(digits, getSecret())}`;
}

/**
 * Returns the normalised phone number the token was issued for, or
 * `null` if it was not issued by us. Never throws on a malformed token:
 * this parses input from a public URL, where garbage is expected and a
 * 500 would be the wrong answer to it.
 */
export function verifyOptOutToken(token: string): string | null {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    // Nothing can be verified without the secret, so every token is
    // untrusted rather than accidentally accepted.
    return null;
  }

  const trimmed = (token ?? '').trim();
  if (trimmed.length <= SIGNATURE_LENGTH) {
    return null;
  }

  const digits = trimmed.slice(0, trimmed.length - SIGNATURE_LENGTH);
  const provided = trimmed.slice(trimmed.length - SIGNATURE_LENGTH);
  if (!/^\d{9}$/.test(digits)) {
    return null;
  }

  const expected = sign(digits, secret);
  const providedBuffer = Buffer.from(provided.toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  return fromSubscriberDigits(digits);
}

/**
 * The full opt-out URL for one recipient. `siteUrl` is passed in rather
 * than read here so this module stays pure and testable — the caller
 * already has `getSiteUrl()`.
 */
export function buildOptOutUrl(siteUrl: string, phoneNumber: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${OPT_OUT_PATH}${buildOptOutToken(phoneNumber)}`;
}

/**
 * What actually gets appended to a marketing message. Kept here, beside
 * the link itself, so the composer's character count and the real send
 * can never disagree about how much room the opt-out takes.
 *
 * The scheme is stripped: every phone's SMS app linkifies
 * `snackquests.shop/s/…` on its own, so `https://` is eight characters
 * of a paid segment buying nothing.
 */
export function optOutSuffix(optOutUrl: string): string {
  return `\nStop ${optOutUrl.replace(/^https?:\/\//, '')}`;
}

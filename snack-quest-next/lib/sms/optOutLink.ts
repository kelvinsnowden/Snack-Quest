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
 * The number is encrypted into the token rather than printed in it.
 * It used to be printed: `/s/712345678a1b2c3d4` carried the recipient's
 * own phone number in the clear, which is a customer's number sitting
 * in a URL that gets forwarded, screenshotted and pasted into group
 * chats. It also looked like tracking, on the one message whose whole
 * job is to be trusted.
 *
 * Still no token→phone lookup table, which is what the old design got
 * right and this keeps: the number travels inside the token, enciphered
 * with the same secret that signs it, so a visit is a decode rather
 * than a database read. The cipher is a small Feistel network over the
 * nine subscriber digits — a real permutation, so two numbers that
 * differ by one digit produce unrelated tokens and nobody can work out
 * the scheme by comparing their own token against a neighbour's.
 *
 * The MAC stays and is the part that matters for safety. Encryption
 * alone would leave every possible token decoding to *some* number, so
 * anyone could walk the keyspace and unsubscribe strangers; the MAC is
 * what makes a token either ours or nothing.
 *
 * Length is a real cost here in a way it never is for email — every
 * character shares a 160-character SMS segment with the message itself.
 * The encoding is 55 bits in 11 base32 characters, which is six
 * characters shorter than the digits-plus-signature it replaces.
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

/**
 * Base32 without the characters people mistype reading a token off a
 * phone screen: no `l` against `1`, no `o` against `0`.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Nine subscriber digits fit in 30 bits (999,999,999 < 2^30). */
const PAYLOAD_CHARS = 6; // 30 bits of base32
/** 25 bits: one guess in 33 million, against an action whose worst case is unsubscribing somebody who can resubscribe by ordering again. */
const MAC_CHARS = 5; // 25 bits
const TOKEN_CHARS = PAYLOAD_CHARS + MAC_CHARS;
const FEISTEL_ROUNDS = 4;
const HALF_MASK = 0x7fff; // 15 bits

/*
 * The two halves are encoded separately rather than as one 55-bit
 * number, because 55 bits does not fit in a JavaScript number and this
 * needs none of the weight of BigInt to avoid it.
 */

/** A round function, not a cipher on its own — keyed, and different every round. */
function roundValue(secret: string, round: number, half: number): number {
  const digest = createHmac('sha256', secret).update(`fe:${round}:${half}`).digest();
  return digest.readUInt32BE(0) & HALF_MASK;
}

/**
 * A balanced Feistel over 30 bits, which is a permutation for any round
 * function at all — that is the property being used, and it is why the
 * same construction runs forwards and backwards with only the round
 * order reversed.
 */
function feistel(secret: string, value: number, reverse: boolean): number {
  let left = (value >>> 15) & HALF_MASK;
  let right = value & HALF_MASK;
  const rounds = [...Array(FEISTEL_ROUNDS).keys()];
  for (const round of reverse ? rounds.reverse() : rounds) {
    const next = left ^ roundValue(secret, round, right);
    left = right;
    right = next;
  }
  // Swapped on the way out, which is what makes the same loop undo itself.
  return ((right & HALF_MASK) * 0x8000 + (left & HALF_MASK)) % 0x40000000;
}

function macOf(secret: string, payload: number): number {
  const digest = createHmac('sha256', secret).update(`mac:${payload}`).digest();
  return digest.readUInt32BE(0) % 0x2000000; // 25 bits
}

function encodeBase32(value: number, characters: number): string {
  let out = '';
  let remaining = value;
  for (let i = 0; i < characters; i += 1) {
    out = ALPHABET[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function decodeBase32(token: string): number | null {
  let value = 0;
  for (const character of token) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) {
      return null;
    }
    value = value * 32 + index;
  }
  return value;
}

/**
 * An 11-character token carrying the number without showing it.
 * Callers pass an already-normalised `254…` number —
 * `normalizeKenyanPhone` is the single place that validation lives.
 */
export function buildOptOutToken(phoneNumber: string): string {
  const secret = getSecret();
  const digits = toSubscriberDigits(phoneNumber);
  const payload = Number(digits);
  /*
   * The MAC is taken over the plaintext, never the ciphertext. Over the
   * ciphertext it would prove only that somebody had produced a valid
   * enciphering — which the cipher already guarantees for every input —
   * and prove nothing about which number came out.
   */
  return (
    encodeBase32(feistel(secret, payload, false), PAYLOAD_CHARS) +
    encodeBase32(macOf(secret, payload), MAC_CHARS)
  );
}

/**
 * The tokens issued before the number was enciphered: nine digits and
 * an eight-character hex signature, printed in the clear.
 *
 * Still honoured, and that is not politeness. These are live in
 * customers' message histories, and an opt-out link that stops working
 * is a person who tries to leave and cannot — the one failure this
 * whole module exists to prevent. New links are never issued in this
 * shape.
 */
function verifyLegacyToken(secret: string, token: string): string | null {
  if (token.length <= SIGNATURE_LENGTH) {
    return null;
  }
  const digits = token.slice(0, token.length - SIGNATURE_LENGTH);
  const provided = token.slice(token.length - SIGNATURE_LENGTH);
  if (!/^\d{9}$/.test(digits)) {
    return null;
  }
  const providedBuffer = Buffer.from(provided.toLowerCase());
  const expectedBuffer = Buffer.from(sign(digits, secret));
  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }
  return fromSubscriberDigits(digits);
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

  const trimmed = (token ?? '').trim().toLowerCase();

  if (trimmed.length !== TOKEN_CHARS) {
    return verifyLegacyToken(secret, trimmed);
  }

  const enciphered = decodeBase32(trimmed.slice(0, PAYLOAD_CHARS));
  const provided = decodeBase32(trimmed.slice(PAYLOAD_CHARS));
  if (enciphered === null || provided === null) {
    return null;
  }

  const payload = feistel(secret, enciphered, true);
  if (macOf(secret, payload) !== provided) {
    return null;
  }

  /*
   * A token can decipher to 30 bits' worth of values, and only some of
   * them are nine-digit numbers. Checked after the MAC rather than
   * instead of it — this rejects nonsense, the MAC rejects forgeries.
   */
  const digits = payload.toString();
  if (digits.length !== 9) {
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

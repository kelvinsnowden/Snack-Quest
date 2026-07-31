import { timingSafeEqual } from 'node:crypto';

/**
 * Real webhook origin verification (§ Secure the Daraja and Whatchimp
 * webhook routes) for the two providers this codebase talks to, neither
 * of which offers anything to verify instead: Safaricom's Daraja API
 * signs nothing (no header, no HMAC — confirmed against its real,
 * public API docs), and Whatchimp has no independently verifiable API
 * documentation at all (see `WhatchimpGateway`'s own class comment).
 * The one mechanism that's real regardless — because this codebase
 * controls both ends of it — is a shared secret embedded in the
 * webhook URL itself: Daraja's CallBackURL/ResultURL/QueueTimeOutURL
 * are submitted fresh on every API call (see
 * `lib/integrations/daraja/config.ts`), so a per-business secret there
 * needs no manual re-registration with Safaricom; Whatchimp's webhook
 * URL is registered once in its app dashboard, so its secret does need
 * one manual update there.
 *
 * Deliberately fail-OPEN (with a loud warning) when no secret is
 * configured yet, not fail-closed: this is being retrofitted onto
 * routes already handling real production payments and real customer
 * messages, and immediately rejecting every request the moment this
 * ships — before an operator has had a chance to provision the secret
 * — would silently break real checkout for every customer. Once a
 * secret IS configured, verification is strict: a missing or wrong
 * key is always rejected.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Compare against something of A's own length so this branch still
    // takes constant time relative to A, not an early return keyed on B.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export type WebhookSecretCheck = { ok: true } | { ok: false; reason: 'missing_key' | 'wrong_key' };

/** `undefined`/`null` expectedSecret means "not configured yet" — always passes, with the caller responsible for logging the warning (it knows the right context: which business, which provider). */
export function checkWebhookSecret(providedKey: string | null, expectedSecret: string | undefined | null): WebhookSecretCheck {
  if (!expectedSecret) {
    return { ok: true };
  }
  if (!providedKey) {
    return { ok: false, reason: 'missing_key' };
  }
  if (!timingSafeEqualStrings(providedKey, expectedSecret)) {
    return { ok: false, reason: 'wrong_key' };
  }
  return { ok: true };
}

/** Appends `?key=<secret>` to a URL this codebase itself constructs and submits to a provider — a no-op (returns `url` unchanged) when no secret is configured, so an unmigrated business's callback URLs are unaffected. */
export function withWebhookSecret(url: string, secret: string | undefined): string {
  if (!secret) {
    return url;
  }
  const withKey = new URL(url);
  withKey.searchParams.set('key', secret);
  return withKey.toString();
}

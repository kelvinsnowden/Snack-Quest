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

/**
 * Separator between a businessId and its webhook secret in a URL path.
 *
 * `~` is RFC 3986 "unreserved" — it never needs percent-encoding, so
 * the URL Safaricom stores is the URL they call. It also cannot appear
 * in a business slug or in the hex secret, so the split is unambiguous.
 */
export const WEBHOOK_SECRET_SEPARATOR = '~';

/**
 * Embeds the secret in the path instead of a query string.
 *
 * Safaricom's own URL rules are restrictive about callback URLs, and
 * query strings are the part most commonly reported as silently
 * dropped or rejected — which matches what production showed: two STK
 * pushes accepted with real CheckoutRequestIDs, and not one callback
 * ever delivered to a `?key=`-suffixed URL.
 *
 * Attached to the **businessId segment** rather than the end of the
 * URL, because several Daraja callbacks are nested under it
 * (`…/{businessId}/b2c-result`). Appending to the last segment would
 * produce `…/b2c-result~secret`, which no longer matches that route.
 *
 * Clears any existing query string and hash on the way in. This
 * function replaced `withWebhookSecret`'s `?key=` suffix for Daraja
 * specifically to get rid of a query string Safaricom's callback
 * delivery was suspected of silently dropping — but the operator's
 * stored "Callback URL" field was never edited when that change
 * shipped, only told to leave it alone. If that field still carried
 * `?key=<old secret>` from before, this would have quietly reattached
 * it (`new URL().toString()` always includes `.search`), reintroducing
 * the exact query string this exists to remove. A callback URL has no
 * legitimate reason to carry either on the way in.
 */
export function withBusinessIdSecret(url: string, secret: string | undefined): string {
  if (!secret) {
    return url;
  }
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = `${stripBusinessIdSecret(parsed.pathname)}${WEBHOOK_SECRET_SEPARATOR}${secret}`;
  return parsed.toString();
}

/**
 * Strips trailing slashes and any `~…` already on the final path
 * segment, so appending the secret cannot double the separator.
 *
 * The separator is invisible in the failure it causes. An operator
 * copying the callback URL out of a log or a support thread very
 * easily keeps the trailing `~` — the secret after it having been
 * redacted — and stores `…/snack-quest~`. Appending to that produces
 * `…/snack-quest~~<secret>`, which splits into the key `~<secret>`,
 * fails verification, and answers every single callback with 403. That
 * is a worse outage than the one it would be pasted to fix, because
 * this time the requests arrive and are refused.
 *
 * `~` cannot appear in a business slug or in a hex secret — that is
 * why it was chosen as the separator — so anything from the first one
 * onwards is leftover, never part of the id.
 */
function stripBusinessIdSecret(pathname: string): string {
  return pathname.replace(/\/+$/, '').replace(/~[^/]*$/, '');
}

/**
 * True when a URL an operator typed already carries a `~…` on its
 * final segment — i.e. a secret (or the bare separator left behind
 * after one was redacted) was pasted into a field that must hold only
 * the base address.
 *
 * `withBusinessIdSecret` normalises this away so a stored value like
 * this still works. This exists so it can also be *rejected* at the
 * point it is typed: silently repairing it would leave a stale secret
 * sitting in configuration, looking authoritative, and would hide the
 * fact that whoever pasted it believes the secret belongs there.
 */
export function carriesBusinessIdSecret(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Not a URL at all — a different check's problem to report.
    return false;
  }
  return /~[^/]*$/.test(pathname.replace(/\/+$/, ''));
}

/** Splits `snack-quest~abc123` back into its parts. A bare id yields a null key, which `checkWebhookSecret` then treats as "no key supplied". */
export function splitBusinessIdSecret(param: string): { businessId: string; key: string | null } {
  const index = (param ?? '').indexOf(WEBHOOK_SECRET_SEPARATOR);
  if (index === -1) {
    return { businessId: param, key: null };
  }
  return { businessId: param.slice(0, index), key: param.slice(index + 1) || null };
}

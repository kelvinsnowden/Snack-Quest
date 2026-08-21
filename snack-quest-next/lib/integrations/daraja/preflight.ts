import type { DarajaConfig } from './config';

/**
 * Checks that "Test Connection" runs against a Daraja configuration
 * before declaring it healthy (§ Daraja M-Pesa Express production
 * readiness).
 *
 * This exists because the previous Test Connection fetched an OAuth
 * token and called that a pass — and an OAuth token proves only that
 * the consumer key and secret are a valid pair. It says nothing about
 * the shortcode, nothing about the passkey, and nothing about whether
 * a prompt can actually reach a phone. So the button reported
 * "connection succeeded" on an account where every single checkout
 * was failing, which is worse than having no button: it moved the
 * search away from the thing that was broken.
 *
 * The checks below are the ones that can be made without moving money.
 * Everything here is either a property of the stored configuration or
 * a side-effect-free API call.
 */
export interface DarajaPreflightIssue {
  /** A blocker fails the test outright; a warning is reported but does not. */
  severity: 'blocker' | 'warning';
  title: string;
  detail: string;
}

/**
 * Safaricom's sandbox passkey, published in their own documentation and
 * reproduced in essentially every M-Pesa tutorial.
 *
 * Worth a named check rather than a generic one because of how it
 * fails. Paired with a production shortcode it is accepted by the STK
 * push endpoint — a real `CheckoutRequestID` comes back, the request
 * looks like it worked — and then no prompt is ever delivered and no
 * callback ever arrives, because the password is validated downstream,
 * asynchronously, by M-Pesa itself. That is indistinguishable from a
 * network problem unless something knows to look for it.
 */
const SANDBOX_PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';

/** The shortcode every Safaricom example uses. Same failure mode as the sandbox passkey, same reason to name it. */
const SANDBOX_SHORTCODE = '174379';

/** Safaricom issues passkeys as 64 hex characters. A value of another shape is usually a consumer secret pasted into the wrong field. */
const PASSKEY_PATTERN = /^[0-9a-f]{64}$/i;

/** Paybills and tills are 5–7 digits. Anything else was mistyped or is a different identifier entirely. */
const SHORTCODE_PATTERN = /^\d{5,7}$/;

function isProduction(config: DarajaConfig): boolean {
  return config.baseUrl.includes('api.safaricom.co.ke');
}

/** Everything that can be judged from the stored configuration alone, with no network call. */
export function inspectDarajaConfig(config: DarajaConfig): DarajaPreflightIssue[] {
  const issues: DarajaPreflightIssue[] = [];
  const production = isProduction(config);

  if (production && config.passkey.trim().toLowerCase() === SANDBOX_PASSKEY) {
    issues.push({
      severity: 'blocker',
      title: 'This is Safaricom’s sandbox passkey, on a production account',
      detail:
        'STK pushes will be accepted and return a CheckoutRequestID, then silently deliver no prompt — the password is checked after the request is acknowledged. Replace it with the production passkey for this shortcode, from the Daraja portal under your live app’s M-Pesa Express product.',
    });
  }

  if (production && config.shortcode.trim() === SANDBOX_SHORTCODE) {
    issues.push({
      severity: 'blocker',
      title: 'This is Safaricom’s sandbox shortcode, on a production account',
      detail: `${SANDBOX_SHORTCODE} is the test paybill from Safaricom’s documentation, not a real one. Use the shortcode your business actually collects money on.`,
    });
  }

  if (!SHORTCODE_PATTERN.test(config.shortcode.trim())) {
    issues.push({
      severity: 'blocker',
      title: 'The shortcode is not a paybill or till number',
      detail: `A paybill or till is 5 to 7 digits. “${config.shortcode}” is not, so M-Pesa has nothing to match it against.`,
    });
  }

  if (!PASSKEY_PATTERN.test(config.passkey.trim())) {
    issues.push({
      severity: 'warning',
      title: 'The passkey is not the shape Safaricom issues',
      detail:
        'Safaricom passkeys are 64 hexadecimal characters. A value of a different shape is usually a consumer secret pasted into the passkey field. If Safaricom gave you this value for this shortcode, ignore this.',
    });
  }

  issues.push(...inspectCallbackUrl(config.callbackUrl));

  // Deliberately NOT checked: whether `accountType` matches what the
  // shortcode really is, and whether a Buy Goods till needs a separate
  // Head Office number. Neither is knowable from here, and guessing
  // would produce confident, wrong advice on a correct configuration.

  return issues;
}

function inspectCallbackUrl(rawUrl: string): DarajaPreflightIssue[] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return [
      {
        severity: 'blocker',
        title: 'The callback URL is not a valid URL',
        detail: `M-Pesa delivers the result of every payment to this address. “${rawUrl}” cannot be parsed, so no payment can ever be confirmed.`,
      },
    ];
  }

  const issues: DarajaPreflightIssue[] = [];

  if (url.protocol !== 'https:') {
    issues.push({
      severity: 'blocker',
      title: 'The callback URL is not HTTPS',
      detail: 'Safaricom refuses to deliver callbacks to a plain HTTP address, so payments would be taken and never confirmed.',
    });
  }

  // Safaricom's network has to reach this host from the outside. A
  // local or private address is reachable from the machine that
  // configured it and from nowhere else, which is a mistake that only
  // ever surfaces as "the money left the customer's account and the
  // order never appeared".
  const host = url.hostname.toLowerCase();
  const isLocal =
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isLocal) {
    issues.push({
      severity: 'blocker',
      title: 'The callback URL points somewhere only this network can reach',
      detail: `Safaricom has to reach “${url.hostname}” from the public internet to confirm a payment. Use your live domain.`,
    });
  }

  return issues;
}

/**
 * What Safaricom's reply to the credentials probe means.
 *
 * The probe asks the STK query endpoint about a `CheckoutRequestID`
 * that cannot exist. That endpoint validates the shortcode and password
 * *before* it looks the transaction up, so the reply separates the two
 * outcomes we care about: a rejection of the credentials, versus a
 * rejection of the (deliberately bogus) transaction id — the latter
 * being the pass, because it means the credentials got that far.
 *
 * Deliberately conservative. Only a reply that clearly names a
 * credentials problem is treated as a blocker; anything unrecognised
 * is reported verbatim as a warning rather than being translated into
 * a confident diagnosis. A Test Connection that fails a working
 * configuration would be worse than the one this replaces.
 */
export function interpretStkCredentialProbe(reply: {
  ok: boolean;
  body: string;
}): DarajaPreflightIssue | null {
  const body = reply.body;

  // Observed verbatim from a live production account whose passkey did
  // not belong to its shortcode — including the exact phrase.
  if (/wrong credentials|invalid credentials|invalid password|bad request - invalid (shortcode|password)/i.test(body)) {
    return {
      severity: 'blocker',
      title: 'M-Pesa rejects this shortcode and passkey together',
      detail:
        'Safaricom answered a credentials check with a credentials error, which means the passkey does not belong to this shortcode, or M-Pesa Express is not yet live on it. STK pushes will still be accepted and return a CheckoutRequestID — they just never reach a phone. Ask Safaricom to confirm M-Pesa Express (Lipa na M-Pesa Online) is activated for this shortcode, and re-copy the passkey issued for it.',
    };
  }

  // The expected pass: credentials accepted, transaction not found.
  if (/invalid checkoutrequestid|transaction.*not found|does not exist|no transaction/i.test(body)) {
    return null;
  }

  // Safaricom also returns this for a query against a request it has
  // simply never seen, which is exactly what the probe sends.
  if (/500\.001\.1001/.test(body)) {
    return null;
  }

  if (reply.ok) {
    return null;
  }

  return {
    severity: 'warning',
    title: 'The credentials check got an answer this app does not recognise',
    detail: `Safaricom said: ${body.slice(0, 300)}`,
  };
}

/** Renders the issues into the one string `IntegrationSettingsService` stores as `lastTestError` and the card shows. */
export function formatPreflightFailure(issues: DarajaPreflightIssue[]): string {
  const blockers = issues.filter((issue) => issue.severity === 'blocker');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const lines = [...blockers, ...warnings].map((issue) => `${issue.title} — ${issue.detail}`);
  return lines.join(' | ');
}

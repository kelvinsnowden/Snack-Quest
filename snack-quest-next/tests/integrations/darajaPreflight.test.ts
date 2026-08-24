import { describe, expect, it } from 'vitest';
import {
  formatPreflightFailure,
  inspectDarajaConfig,
  interpretCallbackProbe,
  interpretStkCredentialProbe,
} from '@/lib/integrations/daraja/preflight';
import type { DarajaConfig } from '@/lib/integrations/daraja/config';

/**
 * What "Test Connection" is allowed to call healthy (§ Daraja M-Pesa
 * Express production readiness).
 *
 * The failure this guards against is specific and was real: an OAuth
 * token proves the consumer key and secret are a valid pair and
 * nothing more, so a button that only fetched one reported success on
 * an account where every checkout was silently dying. Each case below
 * is a configuration that produces exactly that — accepted by the API,
 * never delivered to a phone.
 */

const PRODUCTION_BASE = 'https://api.safaricom.co.ke';
const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const REAL_PASSKEY = 'a'.repeat(64);
const SANDBOX_PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';

function config(overrides: Partial<DarajaConfig> = {}): DarajaConfig {
  return {
    consumerKey: 'ck',
    consumerSecret: 'cs',
    shortcode: '4346089',
    businessShortcode: '4346089',
    accountType: 'till',
    passkey: REAL_PASSKEY,
    callbackUrl: 'https://snackquests.shop/api/webhooks/daraja/snack-quest~abc',
    baseUrl: PRODUCTION_BASE,
    ...overrides,
  };
}

function blockers(issues: ReturnType<typeof inspectDarajaConfig>) {
  return issues.filter((issue) => issue.severity === 'blocker');
}

describe('inspectDarajaConfig', () => {
  it('passes a well-formed production configuration', () => {
    expect(inspectDarajaConfig(config())).toEqual([]);
  });

  /**
   * The headline case. Paired with a production shortcode, the sandbox
   * passkey is accepted by the STK push endpoint — a real
   * CheckoutRequestID comes back — and then no prompt is ever
   * delivered, because the password is validated downstream and
   * asynchronously. Nothing about the request looks wrong at the time
   * it is made, which is exactly why it needs naming.
   */
  it('catches Safaricom’s sandbox passkey on a production account', () => {
    const issues = blockers(inspectDarajaConfig(config({ passkey: SANDBOX_PASSKEY })));

    expect(issues).toHaveLength(1);
    expect(issues[0].title).toMatch(/sandbox passkey/i);
    // Says what the symptom looks like, because the operator is staring
    // at that symptom right now and does not connect it to a passkey.
    expect(issues[0].detail).toMatch(/CheckoutRequestID/);
  });

  it('is case-insensitive about the sandbox passkey, since it gets pasted from documentation', () => {
    expect(blockers(inspectDarajaConfig(config({ passkey: SANDBOX_PASSKEY.toUpperCase() })))).toHaveLength(1);
  });

  /** The same passkey in sandbox is correct, not a fault — it is what sandbox is for. */
  it('does not object to the sandbox passkey on a sandbox account', () => {
    expect(inspectDarajaConfig(config({ passkey: SANDBOX_PASSKEY, baseUrl: SANDBOX_BASE }))).toEqual([]);
  });

  it('catches the documentation shortcode on a production account', () => {
    const issues = blockers(inspectDarajaConfig(config({ shortcode: '174379', businessShortcode: '174379' })));

    expect(issues.some((issue) => /sandbox shortcode/i.test(issue.title))).toBe(true);
  });

  it('rejects a shortcode that cannot be a paybill or till', () => {
    const issues = blockers(inspectDarajaConfig(config({ shortcode: 'SNACKQUEST' })));

    expect(issues.some((issue) => /not a paybill or till/i.test(issue.title))).toBe(true);
  });

  /**
   * A warning, not a blocker: the shape is a strong signal that a
   * consumer secret was pasted into the passkey field, but Safaricom's
   * format is an observation about the keys they have issued, not a
   * promise. Failing a working account over it would repeat the
   * original sin in the other direction.
   */
  it('flags a passkey of the wrong shape without failing the test', () => {
    // Long enough to be a credential, just not Safaricom's format.
    const issues = inspectDarajaConfig(config({ passkey: 'not-a-passkey-but-long-enough-to-be-one' }));

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  /**
   * Found in production: a seven-character passkey. Every STK push was
   * accepted with a real CheckoutRequestID and no prompt ever rang,
   * because the password is validated downstream and asynchronously.
   * A blocker rather than a warning — no Safaricom passkey has ever
   * been a handful of characters, so this is a placeholder or a
   * truncated paste, never a format this app failed to anticipate.
   */
  it('blocks a passkey far too short to be one, and says how short', () => {
    const issues = blockers(inspectDarajaConfig(config({ passkey: 'abc1234' })));

    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('7 characters');
    expect(issues[0].detail).toMatch(/never reach a phone/);
  });

  it('does not escalate a merely unexpected shape to a blocker', () => {
    expect(blockers(inspectDarajaConfig(config({ passkey: 'z'.repeat(64) })))).toEqual([]);
  });

  describe('the callback URL', () => {
    it('must be HTTPS, or Safaricom will not deliver to it', () => {
      const issues = blockers(inspectDarajaConfig(config({ callbackUrl: 'http://snackquests.shop/cb' })));

      expect(issues.some((issue) => /not HTTPS/i.test(issue.title))).toBe(true);
    });

    /** Reachable from the machine that configured it and nowhere else — the mistake only ever surfaces as money taken and no order created. */
    it.each([
      'https://localhost/cb',
      'https://127.0.0.1/cb',
      'https://192.168.1.10/cb',
      'https://10.0.0.4/cb',
      'https://172.16.0.9/cb',
    ])('rejects %s, which Safaricom cannot reach', (callbackUrl) => {
      const issues = blockers(inspectDarajaConfig(config({ callbackUrl })));

      expect(issues.some((issue) => /only this network can reach/i.test(issue.title))).toBe(true);
    });

    it('accepts a public host that merely looks numeric-adjacent', () => {
      expect(inspectDarajaConfig(config({ callbackUrl: 'https://172.32.5.5/cb' }))).toEqual([]);
    });

    it('rejects a value that is not a URL at all', () => {
      const issues = blockers(inspectDarajaConfig(config({ callbackUrl: 'snackquests.shop/cb' })));

      expect(issues.some((issue) => /not a valid URL/i.test(issue.title))).toBe(true);
    });
  });

  /**
   * Deliberately not checked, and asserted so that a future reader sees
   * the omission is a decision. Neither is knowable from the stored
   * configuration, and guessing produces confident, wrong advice about
   * a correct setup.
   */
  it('says nothing about account type or a missing Head Office number', () => {
    expect(inspectDarajaConfig(config({ accountType: 'till', businessShortcode: '4346089' }))).toEqual([]);
    expect(inspectDarajaConfig(config({ accountType: 'paybill' }))).toEqual([]);
  });
});

describe('interpretStkCredentialProbe', () => {
  /** The exact phrase a live production account returned when its passkey did not belong to its shortcode. */
  it('treats “Wrong credentials” as a blocker', () => {
    const issue = interpretStkCredentialProbe({
      ok: false,
      body: JSON.stringify({ ResultCode: 4999, ResultDesc: 'Wrong credentials' }),
    });

    expect(issue?.severity).toBe('blocker');
    expect(issue?.detail).toMatch(/M-Pesa Express/);
  });

  /**
   * The pass. The probe deliberately asks about a transaction that
   * cannot exist, so being told the transaction is unknown means the
   * shortcode and passkey were accepted — which is the whole question.
   */
  it.each([
    JSON.stringify({ errorCode: '500.001.1001', errorMessage: 'Invalid CheckoutRequestID' }),
    JSON.stringify({ errorMessage: 'The transaction does not exist' }),
    JSON.stringify({ errorCode: '500.001.1001', errorMessage: 'something else entirely' }),
  ])('treats an unknown-transaction reply as a pass: %s', (body) => {
    expect(interpretStkCredentialProbe({ ok: false, body })).toBeNull();
  });

  it('passes a 2xx reply', () => {
    expect(interpretStkCredentialProbe({ ok: true, body: '{"ResponseCode":"0"}' })).toBeNull();
  });

  /** Conservative by design: an unrecognised failure is surfaced verbatim, never translated into a diagnosis. */
  it('reports an unrecognised failure as a warning carrying Safaricom’s own words', () => {
    const issue = interpretStkCredentialProbe({ ok: false, body: 'Service temporarily unavailable' });

    expect(issue?.severity).toBe('warning');
    expect(issue?.detail).toContain('Service temporarily unavailable');
  });

  it('truncates a very long reply rather than storing a whole error page', () => {
    const issue = interpretStkCredentialProbe({ ok: false, body: 'x'.repeat(5000) });

    expect(issue?.detail.length).toBeLessThan(400);
  });
});

/**
 * The check that would have caught a real, days-long production
 * outage: STK pushes accepted, `CheckoutRequestID`s returned, money
 * landing in the till, and not one callback ever delivered.
 *
 * The stored callback URL was on the apex domain, which the project
 * 308-redirects to its `www` host. Safaricom does not follow redirects
 * when delivering a callback, so the CDN edge answered every one and
 * the app was never invoked — which is also why there was nothing in
 * the logs to find. Every static check passed it: the URL was valid,
 * HTTPS and publicly routable.
 */
describe('interpretCallbackProbe', () => {
  it('blocks a callback URL that redirects, and names the host to use instead', () => {
    const issue = interpretCallbackProbe({
      status: 308,
      redirectedToHost: 'www.snackquests.shop',
      error: null,
    });

    expect(issue?.severity).toBe('blocker');
    expect(issue?.field).toBe('callbackUrl');
    expect(issue?.detail).toContain('www.snackquests.shop');
    expect(issue?.detail).toMatch(/does not follow redirects/);
  });

  it.each([301, 302, 307, 308])('blocks a %i as readily as any other redirect', (status) => {
    expect(interpretCallbackProbe({ status, redirectedToHost: null, error: null })?.severity).toBe('blocker');
  });

  /**
   * The pass. The callback route exports only `POST`, so a GET that
   * gets 405 has been routed all the way to the handler — which is
   * exactly the question being asked, answered without touching any
   * payment state.
   */
  it('passes the 405 a POST-only callback route answers a GET with', () => {
    expect(interpretCallbackProbe({ status: 405, redirectedToHost: null, error: null })).toBeNull();
  });

  it.each([200, 204])('passes a %i, since something answered', (status) => {
    expect(interpretCallbackProbe({ status, redirectedToHost: null, error: null })).toBeNull();
  });

  it('blocks a 404, because the path leads nowhere', () => {
    expect(interpretCallbackProbe({ status: 404, redirectedToHost: null, error: null })?.severity).toBe('blocker');
  });

  /** Deployment protection or a bot filter in front of the app refuses Safaricom exactly as it refuses this probe. */
  it.each([401, 403])('blocks a %i, since something in front of the app is refusing requests', (status) => {
    const issue = interpretCallbackProbe({ status, redirectedToHost: null, error: null });

    expect(issue?.severity).toBe('blocker');
    expect(issue?.detail).toMatch(/deployment protection|firewall/i);
  });

  it('blocks a request that never completed, quoting the failure', () => {
    const issue = interpretCallbackProbe({ status: null, redirectedToHost: null, error: 'getaddrinfo ENOTFOUND' });

    expect(issue?.severity).toBe('blocker');
    expect(issue?.detail).toContain('getaddrinfo ENOTFOUND');
  });

  /** Conservative in the same way as the credentials probe: an unfamiliar answer is reported, not diagnosed. */
  it('only warns about a status it does not recognise', () => {
    expect(interpretCallbackProbe({ status: 503, redirectedToHost: null, error: null })?.severity).toBe('warning');
  });
});

describe('formatPreflightFailure', () => {
  it('puts blockers before warnings, since one is the reason the test failed', () => {
    const formatted = formatPreflightFailure([
      { severity: 'warning', title: 'Warned', detail: 'w' },
      { severity: 'blocker', title: 'Blocked', detail: 'b' },
    ]);

    expect(formatted.indexOf('Blocked')).toBeLessThan(formatted.indexOf('Warned'));
  });
});

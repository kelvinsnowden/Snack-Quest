import { describe, expect, it } from 'vitest';
import {
  formatPreflightFailure,
  inspectDarajaConfig,
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
    const issues = inspectDarajaConfig(config({ passkey: 'not-a-passkey' }));

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
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

describe('formatPreflightFailure', () => {
  it('puts blockers before warnings, since one is the reason the test failed', () => {
    const formatted = formatPreflightFailure([
      { severity: 'warning', title: 'Warned', detail: 'w' },
      { severity: 'blocker', title: 'Blocked', detail: 'b' },
    ]);

    expect(formatted.indexOf('Blocked')).toBeLessThan(formatted.indexOf('Warned'));
  });
});

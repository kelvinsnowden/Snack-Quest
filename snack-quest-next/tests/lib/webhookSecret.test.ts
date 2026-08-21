import { describe, expect, it } from 'vitest';
import {
  checkWebhookSecret,
  splitBusinessIdSecret,
  timingSafeEqualStrings,
  withBusinessIdSecret,
  withWebhookSecret,
} from '@/lib/webhooks/webhookSecret';

describe('timingSafeEqualStrings', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqualStrings('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqualStrings('abc123', 'abc124')).toBe(false);
  });

  it('returns false for strings of different lengths', () => {
    expect(timingSafeEqualStrings('short', 'a-much-longer-string')).toBe(false);
  });
});

describe('checkWebhookSecret', () => {
  it('passes when no secret is configured, regardless of the provided key', () => {
    expect(checkWebhookSecret(null, undefined)).toEqual({ ok: true });
    expect(checkWebhookSecret('anything', undefined)).toEqual({ ok: true });
    expect(checkWebhookSecret(null, null)).toEqual({ ok: true });
  });

  it('rejects a missing key when a secret is configured', () => {
    expect(checkWebhookSecret(null, 'real-secret')).toEqual({ ok: false, reason: 'missing_key' });
  });

  it('rejects a wrong key when a secret is configured', () => {
    expect(checkWebhookSecret('wrong-secret', 'real-secret')).toEqual({ ok: false, reason: 'wrong_key' });
  });

  it('passes a matching key when a secret is configured', () => {
    expect(checkWebhookSecret('real-secret', 'real-secret')).toEqual({ ok: true });
  });
});

describe('withWebhookSecret', () => {
  it('returns the URL unchanged when no secret is given', () => {
    expect(withWebhookSecret('https://example.com/api/webhooks/daraja/biz-1', undefined)).toBe(
      'https://example.com/api/webhooks/daraja/biz-1',
    );
  });

  it('appends the secret as a "key" query param', () => {
    const result = withWebhookSecret('https://example.com/api/webhooks/daraja/biz-1', 'my-secret');
    expect(result).toBe('https://example.com/api/webhooks/daraja/biz-1?key=my-secret');
  });

  it('adds to existing query params rather than replacing them', () => {
    const result = withWebhookSecret('https://example.com/webhook?foo=bar', 'my-secret');
    const url = new URL(result);
    expect(url.searchParams.get('foo')).toBe('bar');
    expect(url.searchParams.get('key')).toBe('my-secret');
  });
});

/**
 * § Callback secret moved out of the query string.
 *
 * Safaricom's URL rules for callbacks are restrictive, and query
 * strings are the part most commonly reported as dropped. The secret
 * now rides in the path as `{businessId}~{secret}`.
 */
describe('withBusinessIdSecret / splitBusinessIdSecret', () => {
  it('appends the secret to the path, leaving no query string', () => {
    const url = withBusinessIdSecret('https://snackquests.shop/api/webhooks/daraja/snack-quest', 'abc123');

    expect(url).toBe('https://snackquests.shop/api/webhooks/daraja/snack-quest~abc123');
    expect(new URL(url).search).toBe('');
  });

  it('is a no-op when no secret is configured', () => {
    expect(withBusinessIdSecret('https://example.com/api/webhooks/daraja/biz-1', undefined)).toBe(
      'https://example.com/api/webhooks/daraja/biz-1',
    );
  });

  it('tolerates a trailing slash on an operator-entered URL', () => {
    expect(withBusinessIdSecret('https://snackquests.shop/api/webhooks/daraja/snack-quest/', 'abc123')).toBe(
      'https://snackquests.shop/api/webhooks/daraja/snack-quest~abc123',
    );
  });

  it('round-trips back to the real business id', () => {
    expect(splitBusinessIdSecret('snack-quest~abc123')).toEqual({ businessId: 'snack-quest', key: 'abc123' });
  });

  /** A hyphenated slug must survive: the split is on the separator, not on any punctuation. */
  it('keeps hyphens in the business id', () => {
    expect(splitBusinessIdSecret('some-long-business-id~deadbeef')).toEqual({
      businessId: 'some-long-business-id',
      key: 'deadbeef',
    });
  });

  it('reports a bare business id as having no key', () => {
    expect(splitBusinessIdSecret('snack-quest')).toEqual({ businessId: 'snack-quest', key: null });
  });

  it('needs no percent-encoding, so the stored URL is the URL that gets called', () => {
    const url = withBusinessIdSecret('https://snackquests.shop/api/webhooks/daraja/snack-quest', 'abc123');
    expect(new URL(url).toString()).toBe(url);
    expect(url).not.toContain('%');
  });
});

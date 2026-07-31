import { describe, expect, it } from 'vitest';
import { checkWebhookSecret, timingSafeEqualStrings, withWebhookSecret } from '@/lib/webhooks/webhookSecret';

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

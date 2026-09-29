import { afterEach, describe, expect, it } from 'vitest';
import { isAuthorizedCronRequest, secretsMatch } from '@/lib/auth/cronAuth';

describe('secretsMatch', () => {
  it('matches only the exact secret', () => {
    expect(secretsMatch('s3cret-value', 's3cret-value')).toBe(true);
    expect(secretsMatch('s3cret-valuf', 's3cret-value')).toBe(false);
    expect(secretsMatch('s3cret', 's3cret-value')).toBe(false);
    expect(secretsMatch('', 's3cret-value')).toBe(false);
    // Same character count, different byte length: must not throw.
    expect(secretsMatch('é', 'ee')).toBe(false);
  });
});

describe('isAuthorizedCronRequest', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });
  const withAuth = (value?: string) => new Request('http://localhost/api/cron/x', { headers: value ? { authorization: value } : {} });

  it('accepts only the bearer secret, and refuses everything when none is configured', () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect(isAuthorizedCronRequest(withAuth('Bearer cron-secret'))).toBe(true);
    expect(isAuthorizedCronRequest(withAuth('Bearer cron-secreT'))).toBe(false);
    expect(isAuthorizedCronRequest(withAuth())).toBe(false);
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(withAuth('Bearer '))).toBe(false);
  });
});

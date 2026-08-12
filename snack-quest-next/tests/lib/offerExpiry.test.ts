import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { hoursUntilOfferExpiry, isOfferExpired } from '@/lib/packages/offerExpiry';

describe('isOfferExpired', () => {
  it('is never expired when unset', () => {
    expect(isOfferExpired(null)).toBe(false);
    expect(isOfferExpired(undefined)).toBe(false);
  });

  it('is true once the timestamp is behind now', () => {
    expect(isOfferExpired(Timestamp.fromMillis(Date.now() - 1000))).toBe(true);
  });

  it('is false while the timestamp is still ahead of now', () => {
    expect(isOfferExpired(Timestamp.fromMillis(Date.now() + 60 * 60 * 1000))).toBe(false);
  });
});

describe('hoursUntilOfferExpiry', () => {
  it('returns null when unset', () => {
    expect(hoursUntilOfferExpiry(null)).toBeNull();
    expect(hoursUntilOfferExpiry(undefined)).toBeNull();
  });

  it('returns a positive number of hours for a future expiry', () => {
    const hours = hoursUntilOfferExpiry(Timestamp.fromMillis(Date.now() + 5 * 60 * 60 * 1000));
    expect(hours).toBeGreaterThan(4.9);
    expect(hours).toBeLessThan(5.1);
  });

  it('returns a negative number of hours for a past expiry', () => {
    const hours = hoursUntilOfferExpiry(Timestamp.fromMillis(Date.now() - 60 * 60 * 1000));
    expect(hours).toBeLessThan(0);
  });
});

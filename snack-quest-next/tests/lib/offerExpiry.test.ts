import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { isOfferExpired } from '@/lib/packages/offerExpiry';

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

import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { discountCodeRepository } from '@/repositories/discountCodeRepository';

const BUSINESS_ID = 'biz-discount-repo';

function input(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BUSINESS_ID,
    code: 'PRBOX',
    kind: 'percentage' as const,
    value: 100,
    waivesDelivery: true,
    maxRedemptions: null as number | null,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    note: 'Influencer PR',
    createdBy: 'admin-uid',
    ...overrides,
  };
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('discountCodes'));
});

describe('creating a code', () => {
  it('stores it under a business-scoped id, found however it was typed', async () => {
    await discountCodeRepository.create(input());

    expect((await discountCodeRepository.findByCode(BUSINESS_ID, 'prbox'))?.value).toBe(100);
    expect((await discountCodeRepository.findByCode(BUSINESS_ID, '  PrBox '))?.code).toBe('PRBOX');
  });

  /* Two staff adding the same code should be one code and one error, not a silent overwrite. */
  it('refuses a duplicate rather than overwriting the first one', async () => {
    await discountCodeRepository.create(input({ value: 100 }));
    const second = await discountCodeRepository.create(input({ value: 10 }));

    expect(second.created).toBe(false);
    expect(second.reason).toMatch(/already exists/i);
    expect((await discountCodeRepository.findByCode(BUSINESS_ID, 'PRBOX'))?.value).toBe(100);
  });

  /** One tenant's code is not another's, which the composed id gets for free. */
  it('keeps codes separate between businesses', async () => {
    await discountCodeRepository.create(input());
    expect(await discountCodeRepository.findByCode('other-biz', 'PRBOX')).toBeNull();
  });
});

describe('claiming a redemption', () => {
  it('claims a live code and counts it', async () => {
    await discountCodeRepository.create(input({ maxRedemptions: 2 }));

    const claim = await discountCodeRepository.claimRedemption(BUSINESS_ID, 'PRBOX');
    expect(claim.claimed).toBe(true);
    expect((await discountCodeRepository.findByCode(BUSINESS_ID, 'PRBOX'))?.redemptionCount).toBe(1);
  });

  /*
   * The reason redemption is a transaction and the counter lives on the
   * document. A code handed to one influencer is `maxRedemptions: 1`,
   * and a read-then-write would let two simultaneous checkouts both
   * read zero and both proceed — giving away two boxes against a limit
   * of one.
   */
  it('holds a single-use limit against simultaneous checkouts', async () => {
    await discountCodeRepository.create(input({ maxRedemptions: 1 }));

    const results = await Promise.all(
      Array.from({ length: 5 }, () => discountCodeRepository.claimRedemption(BUSINESS_ID, 'PRBOX')),
    );

    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(results.filter((r) => !r.claimed)).toHaveLength(4);
    expect((await discountCodeRepository.findByCode(BUSINESS_ID, 'PRBOX'))?.redemptionCount).toBe(1);
  });

  it('refuses an unknown, inactive or exhausted code with the reason why', async () => {
    expect(await discountCodeRepository.claimRedemption(BUSINESS_ID, 'NOPE')).toMatchObject({
      claimed: false,
      reason: 'not_found',
    });

    await discountCodeRepository.create(input({ code: 'OFF', isActive: false }));
    expect(await discountCodeRepository.claimRedemption(BUSINESS_ID, 'OFF')).toMatchObject({
      claimed: false,
      reason: 'inactive',
    });

    await discountCodeRepository.create(input({ code: 'ONCE', maxRedemptions: 1 }));
    await discountCodeRepository.claimRedemption(BUSINESS_ID, 'ONCE');
    expect(await discountCodeRepository.claimRedemption(BUSINESS_ID, 'ONCE')).toMatchObject({
      claimed: false,
      reason: 'fully_redeemed',
    });
  });

  it('never claims against an unlimited code more than it should count', async () => {
    await discountCodeRepository.create(input({ maxRedemptions: null }));
    await Promise.all(
      Array.from({ length: 4 }, () => discountCodeRepository.claimRedemption(BUSINESS_ID, 'PRBOX')),
    );
    expect((await discountCodeRepository.findByCode(BUSINESS_ID, 'PRBOX'))?.redemptionCount).toBe(4);
  });
});

describe('releasing a redemption', () => {
  /*
   * The cost of claiming at freeze time is that an abandoned M-Pesa
   * prompt would otherwise spend the code. For a code issued to one
   * influencer, spending it without a box leaving the warehouse makes
   * it useless to the person it was meant for.
   */
  it('makes a single-use code usable again after a failed payment', async () => {
    await discountCodeRepository.create(input({ maxRedemptions: 1 }));
    await discountCodeRepository.claimRedemption(BUSINESS_ID, 'PRBOX');

    await discountCodeRepository.releaseRedemption(BUSINESS_ID, 'PRBOX');

    expect((await discountCodeRepository.claimRedemption(BUSINESS_ID, 'PRBOX')).claimed).toBe(true);
  });

  /** A double release must not leave negative usage, which would silently raise the limit. */
  it('floors at zero', async () => {
    await discountCodeRepository.create(input({ maxRedemptions: 1 }));
    await discountCodeRepository.releaseRedemption(BUSINESS_ID, 'PRBOX');
    await discountCodeRepository.releaseRedemption(BUSINESS_ID, 'PRBOX');

    expect((await discountCodeRepository.findByCode(BUSINESS_ID, 'PRBOX'))?.redemptionCount).toBe(0);
  });

  it('is silent about a code that no longer exists', async () => {
    await expect(
      discountCodeRepository.releaseRedemption(BUSINESS_ID, 'GONE'),
    ).resolves.toBeUndefined();
  });
});

describe('editing a code', () => {
  /** Usage is a record of what happened, not a setting, so it is not patchable. */
  it('changes settings without touching the redemption count', async () => {
    await discountCodeRepository.create(input({ maxRedemptions: 5 }));
    await discountCodeRepository.claimRedemption(BUSINESS_ID, 'PRBOX');

    await discountCodeRepository.update(BUSINESS_ID, 'PRBOX', { isActive: false }, 'admin-2');

    const after = await discountCodeRepository.findByCode(BUSINESS_ID, 'PRBOX');
    expect(after?.isActive).toBe(false);
    expect(after?.redemptionCount).toBe(1);
  });
});

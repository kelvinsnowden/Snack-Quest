import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  creatorRepository,
  claimNextRegistrationNumberInTransaction,
} from '@/repositories/creatorRepository';
import { clearCreatorMemberships, seedCreator } from '../helpers/creatorFixtures';

/** `listByBusiness` (§ Admin: Creators) — scoping, status filtering, and pagination against the real emulator. */

const BUSINESS_ID = 'biz-creator-repo-test';
const OTHER_BUSINESS_ID = 'biz-creator-repo-other';

beforeEach(async () => {
  await clearCreatorMemberships(BUSINESS_ID, OTHER_BUSINESS_ID);
  await adminFirestore.recursiveDelete(
    adminFirestore
      .collection('businesses')
      .doc(BUSINESS_ID)
      .collection('counters'),
  );
  await adminFirestore.recursiveDelete(
    adminFirestore
      .collection('businesses')
      .doc(OTHER_BUSINESS_ID)
      .collection('counters'),
  );
});

describe('claimNextRegistrationNumberInTransaction', () => {
  it('starts at 1 and increments by 1 on each claim', async () => {
    const first = await adminFirestore.runTransaction((tx) =>
      claimNextRegistrationNumberInTransaction(tx, BUSINESS_ID),
    );
    const second = await adminFirestore.runTransaction((tx) =>
      claimNextRegistrationNumberInTransaction(tx, BUSINESS_ID),
    );
    const third = await adminFirestore.runTransaction((tx) =>
      claimNextRegistrationNumberInTransaction(tx, BUSINESS_ID),
    );

    expect([first, second, third]).toEqual([1, 2, 3]);
  });

  it('is scoped per business — two businesses each start their own count at 1', async () => {
    const a1 = await adminFirestore.runTransaction((tx) =>
      claimNextRegistrationNumberInTransaction(tx, BUSINESS_ID),
    );
    const b1 = await adminFirestore.runTransaction((tx) =>
      claimNextRegistrationNumberInTransaction(tx, OTHER_BUSINESS_ID),
    );
    const a2 = await adminFirestore.runTransaction((tx) =>
      claimNextRegistrationNumberInTransaction(tx, BUSINESS_ID),
    );

    expect([a1, b1, a2]).toEqual([1, 1, 2]);
  });
});

describe('creatorRepository.listByBusiness', () => {
  it('lists only the given business, newest first', async () => {
    await seedCreator('other-biz-creator', { businessId: OTHER_BUSINESS_ID });
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await seedCreator('creator-2', { businessId: BUSINESS_ID });

    const { creators, nextCursor } =
      await creatorRepository.listByBusiness(BUSINESS_ID);

    expect(creators.map((c) => c.id)).toEqual(['creator-2', 'creator-1']);
    expect(nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    await seedCreator('creator-pending', {
      businessId: BUSINESS_ID,
      status: 'pending',
    });
    await seedCreator('creator-active', {
      businessId: BUSINESS_ID,
      status: 'active',
    });

    const { creators } = await creatorRepository.listByBusiness(BUSINESS_ID, {
      status: 'active',
    });

    expect(creators.map((c) => c.id)).toEqual(['creator-active']);
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedCreator(`creator-${i}`, { businessId: BUSINESS_ID });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstPage = await creatorRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
    });
    expect(firstPage.creators).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await creatorRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.creators).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('filters by followersRange (§ Creator Marketplace, admin creator search)', async () => {
    await seedCreator('creator-small', {
      businessId: BUSINESS_ID,
      followersRange: 'Under 1,000',
    });
    await seedCreator('creator-big', {
      businessId: BUSINESS_ID,
      followersRange: '100,000+',
    });

    const { creators } = await creatorRepository.listByBusiness(BUSINESS_ID, {
      followersRange: '100,000+',
    });

    expect(creators.map((c) => c.id)).toEqual(['creator-big']);
  });

  it('combines status and followersRange filters', async () => {
    await seedCreator('creator-match', {
      businessId: BUSINESS_ID,
      status: 'active',
      followersRange: '100,000+',
    });
    await seedCreator('creator-wrong-status', {
      businessId: BUSINESS_ID,
      status: 'pending',
      followersRange: '100,000+',
    });
    await seedCreator('creator-wrong-range', {
      businessId: BUSINESS_ID,
      status: 'active',
      followersRange: 'Under 1,000',
    });

    const { creators } = await creatorRepository.listByBusiness(BUSINESS_ID, {
      status: 'active',
      followersRange: '100,000+',
    });

    expect(creators.map((c) => c.id)).toEqual(['creator-match']);
  });
});

describe('creatorRepository.incrementClickCount', () => {
  it('increments totalClicks by 1 each call', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });

    await creatorRepository.incrementClickCount(BUSINESS_ID, 'creator-1');
    await creatorRepository.incrementClickCount(BUSINESS_ID, 'creator-1');

    const found = await creatorRepository.findById(BUSINESS_ID, 'creator-1');
    expect(found?.totalClicks).toBe(2);
  });
});

describe('creatorRepository.findById — multi-business membership (§ Creator Marketplace migration)', () => {
  it('returns independent profiles for the same uid registered under two different businesses', async () => {
    const uid = 'creator-multi-business';
    await seedCreator(uid, { businessId: BUSINESS_ID, availableCashKes: 100 });
    await seedCreator(uid, { businessId: OTHER_BUSINESS_ID, availableCashKes: 900 });

    const inFirstBusiness = await creatorRepository.findById(BUSINESS_ID, uid);
    const inOtherBusiness = await creatorRepository.findById(OTHER_BUSINESS_ID, uid);

    expect(inFirstBusiness?.availableCashKes).toBe(100);
    expect(inOtherBusiness?.availableCashKes).toBe(900);
  });

  it('never leaks a mutation from one business membership into the other', async () => {
    const uid = 'creator-multi-business-mutate';
    await seedCreator(uid, { businessId: BUSINESS_ID, totalClicks: 0 });
    await seedCreator(uid, { businessId: OTHER_BUSINESS_ID, totalClicks: 0 });

    await creatorRepository.incrementClickCount(BUSINESS_ID, uid);
    await creatorRepository.incrementClickCount(BUSINESS_ID, uid);

    const inFirstBusiness = await creatorRepository.findById(BUSINESS_ID, uid);
    const inOtherBusiness = await creatorRepository.findById(OTHER_BUSINESS_ID, uid);

    expect(inFirstBusiness?.totalClicks).toBe(2);
    expect(inOtherBusiness?.totalClicks).toBe(0);
  });

  it('returns null for a uid that has no membership in the given business, even if it has one elsewhere', async () => {
    const uid = 'creator-only-in-first-business';
    await seedCreator(uid, { businessId: BUSINESS_ID });

    expect(await creatorRepository.findById(OTHER_BUSINESS_ID, uid)).toBeNull();
  });
});

describe('creatorRepository.listTopByBusiness', () => {
  it('ranks only active creators in the business by lifetime earnings, highest first', async () => {
    await seedCreator('creator-low', {
      businessId: BUSINESS_ID,
      status: 'active',
      lifetimeEarningsKes: 100,
    });
    await seedCreator('creator-high', {
      businessId: BUSINESS_ID,
      status: 'active',
      lifetimeEarningsKes: 900,
    });
    await seedCreator('creator-pending', {
      businessId: BUSINESS_ID,
      status: 'pending',
      lifetimeEarningsKes: 5000,
    });
    await seedCreator('creator-other-biz', {
      businessId: OTHER_BUSINESS_ID,
      status: 'active',
      lifetimeEarningsKes: 5000,
    });

    const top = await creatorRepository.listTopByBusiness(BUSINESS_ID, 10);

    expect(top.map((c) => c.id)).toEqual(['creator-high', 'creator-low']);
  });

  it('respects the limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedCreator(`creator-${i}`, {
        businessId: BUSINESS_ID,
        status: 'active',
        lifetimeEarningsKes: i * 100,
      });
    }

    const top = await creatorRepository.listTopByBusiness(BUSINESS_ID, 2);
    expect(top).toHaveLength(2);
  });
});

describe('creatorRepository.countActiveAboveEarnings / countActive', () => {
  it('counts only active creators strictly above the given amount', async () => {
    await seedCreator('creator-1', {
      businessId: BUSINESS_ID,
      status: 'active',
      lifetimeEarningsKes: 100,
    });
    await seedCreator('creator-2', {
      businessId: BUSINESS_ID,
      status: 'active',
      lifetimeEarningsKes: 500,
    });
    await seedCreator('creator-3', {
      businessId: BUSINESS_ID,
      status: 'active',
      lifetimeEarningsKes: 1000,
    });
    await seedCreator('creator-pending', {
      businessId: BUSINESS_ID,
      status: 'pending',
      lifetimeEarningsKes: 5000,
    });

    await expect(
      creatorRepository.countActiveAboveEarnings(BUSINESS_ID, 500),
    ).resolves.toBe(1);
    await expect(
      creatorRepository.countActiveAboveEarnings(BUSINESS_ID, 0),
    ).resolves.toBe(3);
  });

  it('counts every active creator in the business, regardless of earnings', async () => {
    await seedCreator('creator-1', {
      businessId: BUSINESS_ID,
      status: 'active',
    });
    await seedCreator('creator-2', {
      businessId: BUSINESS_ID,
      status: 'active',
    });
    await seedCreator('creator-pending', {
      businessId: BUSINESS_ID,
      status: 'pending',
    });

    await expect(creatorRepository.countActive(BUSINESS_ID)).resolves.toBe(2);
  });
});

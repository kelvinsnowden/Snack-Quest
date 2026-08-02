import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { creatorRepository } from '@/repositories/creatorRepository';
import { seedCreator } from '../helpers/creatorFixtures';

/** `listByBusiness` (§ Admin: Creators) — scoping, status filtering, and pagination against the real emulator. */

const BUSINESS_ID = 'biz-creator-repo-test';
const OTHER_BUSINESS_ID = 'biz-creator-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('creatorProfiles'));
});

describe('creatorRepository.listByBusiness', () => {
  it('lists only the given business, newest first', async () => {
    await seedCreator('other-biz-creator', { businessId: OTHER_BUSINESS_ID });
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await seedCreator('creator-2', { businessId: BUSINESS_ID });

    const { creators, nextCursor } = await creatorRepository.listByBusiness(BUSINESS_ID);

    expect(creators.map((c) => c.id)).toEqual(['creator-2', 'creator-1']);
    expect(nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    await seedCreator('creator-pending', { businessId: BUSINESS_ID, status: 'pending' });
    await seedCreator('creator-active', { businessId: BUSINESS_ID, status: 'active' });

    const { creators } = await creatorRepository.listByBusiness(BUSINESS_ID, { status: 'active' });

    expect(creators.map((c) => c.id)).toEqual(['creator-active']);
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedCreator(`creator-${i}`, { businessId: BUSINESS_ID });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstPage = await creatorRepository.listByBusiness(BUSINESS_ID, { limit: 2 });
    expect(firstPage.creators).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await creatorRepository.listByBusiness(BUSINESS_ID, { limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.creators).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe('creatorRepository.incrementClickCount', () => {
  it('increments totalClicks by 1 each call', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });

    await creatorRepository.incrementClickCount('creator-1');
    await creatorRepository.incrementClickCount('creator-1');

    const found = await creatorRepository.findById('creator-1');
    expect(found?.totalClicks).toBe(2);
  });
});

describe('creatorRepository.listTopByBusiness', () => {
  it('ranks only active creators in the business by lifetime earnings, highest first', async () => {
    await seedCreator('creator-low', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 100 });
    await seedCreator('creator-high', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 900 });
    await seedCreator('creator-pending', { businessId: BUSINESS_ID, status: 'pending', lifetimeEarningsKes: 5000 });
    await seedCreator('creator-other-biz', { businessId: OTHER_BUSINESS_ID, status: 'active', lifetimeEarningsKes: 5000 });

    const top = await creatorRepository.listTopByBusiness(BUSINESS_ID, 10);

    expect(top.map((c) => c.id)).toEqual(['creator-high', 'creator-low']);
  });

  it('respects the limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedCreator(`creator-${i}`, { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: i * 100 });
    }

    const top = await creatorRepository.listTopByBusiness(BUSINESS_ID, 2);
    expect(top).toHaveLength(2);
  });
});

describe('creatorRepository.countActiveAboveEarnings / countActive', () => {
  it('counts only active creators strictly above the given amount', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 100 });
    await seedCreator('creator-2', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 500 });
    await seedCreator('creator-3', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 1000 });
    await seedCreator('creator-pending', { businessId: BUSINESS_ID, status: 'pending', lifetimeEarningsKes: 5000 });

    await expect(creatorRepository.countActiveAboveEarnings(BUSINESS_ID, 500)).resolves.toBe(1);
    await expect(creatorRepository.countActiveAboveEarnings(BUSINESS_ID, 0)).resolves.toBe(3);
  });

  it('counts every active creator in the business, regardless of earnings', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active' });
    await seedCreator('creator-2', { businessId: BUSINESS_ID, status: 'active' });
    await seedCreator('creator-pending', { businessId: BUSINESS_ID, status: 'pending' });

    await expect(creatorRepository.countActive(BUSINESS_ID)).resolves.toBe(2);
  });
});

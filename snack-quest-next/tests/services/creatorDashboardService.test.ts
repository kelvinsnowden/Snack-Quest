import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { clearCreatorMemberships, seedCreator } from '../helpers/creatorFixtures';

/** `CreatorDashboardService.getLeaderboard` (§ Creator Portal leaderboards) — the top-earners list plus the caller's own rank, against the real emulator. */

const BUSINESS_ID = 'biz-creator-dashboard-service-test';

beforeEach(async () => {
  await clearCreatorMemberships(BUSINESS_ID);
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
});

describe('CreatorDashboardService.getLeaderboard', () => {
  it('ranks active creators by lifetime earnings and joins their display name', async () => {
    await seedCreator('creator-high', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 900 });
    await userRepository.create('creator-high', { email: 'high@example.com', roles: ['creator'], displayName: 'Top Earner', photoURL: null }, 'system');
    await seedCreator('creator-low', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 100 });
    await userRepository.create('creator-low', { email: 'low@example.com', roles: ['creator'], displayName: 'Newer Creator', photoURL: null }, 'system');

    const leaderboard = await creatorDashboardService.getLeaderboard(BUSINESS_ID, 'creator-low');

    expect(leaderboard.top.map((entry) => entry.displayName)).toEqual(['Top Earner', 'Newer Creator']);
    expect(leaderboard.totalActiveCreators).toBe(2);
    expect(leaderboard.myRank).toBe(2);
  });

  it('returns myRank null for a pending creator, without erroring', async () => {
    await seedCreator('creator-pending', { businessId: BUSINESS_ID, status: 'pending' });

    const leaderboard = await creatorDashboardService.getLeaderboard(BUSINESS_ID, 'creator-pending');

    expect(leaderboard.myRank).toBeNull();
  });

  it('returns myRank null for a uid with no creator profile at all', async () => {
    const leaderboard = await creatorDashboardService.getLeaderboard(BUSINESS_ID, 'no-such-creator');
    expect(leaderboard.myRank).toBeNull();
  });

  it('falls back to "Unknown creator" when no users doc exists for a ranked creator', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active', lifetimeEarningsKes: 500 });

    const leaderboard = await creatorDashboardService.getLeaderboard(BUSINESS_ID, 'creator-1');

    expect(leaderboard.top[0].displayName).toBe('Unknown creator');
  });
});

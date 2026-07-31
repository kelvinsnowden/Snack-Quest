import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { creatorRepository } from '@/repositories/creatorRepository';
import { creatorAdminService, CreatorNotFoundError, InvalidCreatorTransitionError } from '@/services/creatorAdminService';
import { seedCreator } from '../helpers/creatorFixtures';

/**
 * `CreatorAdminService` (§ Admin: Creators) — transition enforcement,
 * tenant isolation, and the `users` join for display, against the
 * real emulator.
 */

const BUSINESS_ID = 'biz-creator-admin-service-test';
const OTHER_BUSINESS_ID = 'biz-creator-admin-service-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('creatorProfiles'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('CreatorAdminService.updateStatus', () => {
  it('approves a pending creator into active and publishes a domain event', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'pending' });

    await creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'active', 'staff-1');

    const updated = await creatorRepository.findById('creator-1');
    expect(updated?.status).toBe('active');

    const events = await adminFirestore.collection('domainEvents').get();
    const event = events.docs.map((d) => d.data()).find((d) => d.type === 'CreatorStatusChanged');
    expect(event).toMatchObject({ businessId: BUSINESS_ID, aggregateId: 'creator-1', payload: { from: 'pending', to: 'active' } });
  });

  it('rejects an illegal transition', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID, status: 'active' });

    await expect(creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'pending', 'staff-1')).rejects.toBeInstanceOf(
      InvalidCreatorTransitionError,
    );
  });

  it('throws CreatorNotFoundError for a creator in a different business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID, status: 'pending' });

    await expect(creatorAdminService.updateStatus(BUSINESS_ID, 'creator-1', 'active', 'staff-1')).rejects.toBeInstanceOf(
      CreatorNotFoundError,
    );
  });

  it('throws CreatorNotFoundError for a nonexistent creator', async () => {
    await expect(
      creatorAdminService.updateStatus(BUSINESS_ID, 'does-not-exist', 'active', 'staff-1'),
    ).rejects.toBeInstanceOf(CreatorNotFoundError);
  });
});

describe('CreatorAdminService.listCreators / getCreator', () => {
  it('joins each creator with their users/{uid} identity', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await userRepository.create('creator-1', { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null }, 'system');

    const { creators } = await creatorAdminService.listCreators(BUSINESS_ID);

    expect(creators).toHaveLength(1);
    expect(creators[0].user?.displayName).toBe('Cool Creator');
  });

  it('getCreator throws for a creator outside the business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID });

    await expect(creatorAdminService.getCreator(BUSINESS_ID, 'creator-1')).rejects.toBeInstanceOf(CreatorNotFoundError);
  });
});

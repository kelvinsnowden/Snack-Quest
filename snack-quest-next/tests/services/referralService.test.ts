import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { userRepository } from '@/repositories/userRepository';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { createInTransaction as createAttributionInTransaction } from '@/repositories/referralAttributionRepository';
import {
  referralService,
  ReferralLinkNotFoundError,
  DuplicateReferralCodeError,
  CreatorNotEligibleError,
} from '@/services/referralService';
import { seedCreator } from '../helpers/creatorFixtures';

/**
 * `ReferralService`'s admin-facing methods (§ Admin: Referrals):
 * link creation validates the owning creator is real and eligible and
 * the code is unique; list methods join with `users` for display.
 */

const BUSINESS_ID = 'biz-referral-service-test';
const OTHER_BUSINESS_ID = 'biz-referral-service-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('referralLinks'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('referralAttributions'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('creatorProfiles'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('users'));
});

describe('ReferralService.createLink', () => {
  it('creates a link for a real creator in the same business, normalizing the code', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });

    const linkId = await referralService.createLink(
      { businessId: BUSINESS_ID, ownerId: 'creator-1', code: ' save10 ', discountKes: 100, commissionKes: 50, isActive: true },
      'staff-1',
    );

    const link = await referralLinkRepository.findById(BUSINESS_ID, linkId);
    expect(link?.code).toBe('SAVE10');
  });

  it('rejects a creator that does not exist', async () => {
    await expect(
      referralService.createLink(
        { businessId: BUSINESS_ID, ownerId: 'no-such-creator', code: 'X', discountKes: 0, commissionKes: 0, isActive: true },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(CreatorNotEligibleError);
  });

  it('rejects a creator that belongs to a different business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID });

    await expect(
      referralService.createLink(
        { businessId: BUSINESS_ID, ownerId: 'creator-1', code: 'X', discountKes: 0, commissionKes: 0, isActive: true },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(CreatorNotEligibleError);
  });

  it('rejects a duplicate code within the same business', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await referralService.createLink(
      { businessId: BUSINESS_ID, ownerId: 'creator-1', code: 'SAVE10', discountKes: 100, commissionKes: 50, isActive: true },
      'staff-1',
    );

    await expect(
      referralService.createLink(
        { businessId: BUSINESS_ID, ownerId: 'creator-1', code: 'save10', discountKes: 200, commissionKes: 60, isActive: true },
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(DuplicateReferralCodeError);
  });
});

describe('ReferralService.updateLink', () => {
  it('throws ReferralLinkNotFoundError for a link outside the business', async () => {
    await seedCreator('creator-1', { businessId: OTHER_BUSINESS_ID });
    const linkId = await referralService.createLink(
      { businessId: OTHER_BUSINESS_ID, ownerId: 'creator-1', code: 'X', discountKes: 0, commissionKes: 0, isActive: true },
      'staff-1',
    );

    await expect(referralService.updateLink(BUSINESS_ID, linkId, { isActive: false }, 'staff-1')).rejects.toBeInstanceOf(
      ReferralLinkNotFoundError,
    );
  });

  it('rejects renaming to a code already used by another link', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await referralService.createLink(
      { businessId: BUSINESS_ID, ownerId: 'creator-1', code: 'TAKEN', discountKes: 0, commissionKes: 0, isActive: true },
      'staff-1',
    );
    const linkId = await referralService.createLink(
      { businessId: BUSINESS_ID, ownerId: 'creator-1', code: 'FREE', discountKes: 0, commissionKes: 0, isActive: true },
      'staff-1',
    );

    await expect(referralService.updateLink(BUSINESS_ID, linkId, { code: 'taken' }, 'staff-1')).rejects.toBeInstanceOf(
      DuplicateReferralCodeError,
    );
  });
});

describe('ReferralService.listLinks / listCommissions', () => {
  it('joins links with their owning creator identity', async () => {
    await seedCreator('creator-1', { businessId: BUSINESS_ID });
    await userRepository.create('creator-1', { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null }, 'system');
    await referralService.createLink(
      { businessId: BUSINESS_ID, ownerId: 'creator-1', code: 'SAVE10', discountKes: 100, commissionKes: 50, isActive: true },
      'staff-1',
    );

    const { links } = await referralService.listLinks(BUSINESS_ID);

    expect(links).toHaveLength(1);
    expect(links[0].owner?.displayName).toBe('Cool Creator');
  });

  it('joins commissions with the credited creator identity', async () => {
    await userRepository.create('creator-1', { email: 'creator@example.com', roles: ['creator'], displayName: 'Cool Creator', photoURL: null }, 'system');
    await adminFirestore.runTransaction(async (tx) => {
      createAttributionInTransaction(tx, {
        businessId: BUSINESS_ID,
        referralLinkId: 'link-1',
        creatorId: 'creator-1',
        orderId: 'order-1',
        conversationId: 'conv-1',
        discountKes: 100,
        commissionKes: 50,
      });
    });

    const { commissions } = await referralService.listCommissions(BUSINESS_ID);

    expect(commissions).toHaveLength(1);
    expect(commissions[0].creator?.displayName).toBe('Cool Creator');
    expect(commissions[0].data.commissionKes).toBe(50);
  });
});

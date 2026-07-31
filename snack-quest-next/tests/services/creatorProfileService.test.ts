import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { creatorRepository } from '@/repositories/creatorRepository';
import {
  creatorProfileService,
  InvalidOnboardingInputError,
  OnboardingAlreadyCompletedError,
} from '@/services/creatorProfileService';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';

const UID = 'creator-onboarding-test';
const BUSINESS_ID = 'biz-onboarding-test';

async function seedPendingCreator(overrides: Partial<Parameters<typeof creatorRepository.create>[1]> = {}) {
  await creatorRepository.create(UID, {
    businessId: BUSINESS_ID,
    referralCode: 'TEST1234',
    tier: 'bronze',
    availableCashKes: 0,
    pendingEarningsKes: 0,
    lifetimeEarningsKes: 0,
    totalClicks: 0,
    totalConversions: 0,
    bio: '',
    niche: '',
    followersRange: '',
    paymentPreference: 'mpesa',
    socialHandles: {},
    onboardingCompleted: false,
    status: 'pending',
    schemaVersion: 1,
    ...overrides,
  });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('creatorProfiles'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('CreatorProfileService.completeOnboarding', () => {
  it('throws for a uid with no creator profile', async () => {
    await expect(
      creatorProfileService.completeOnboarding('no-such-creator', {
        bio: 'Bio',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'mpesa',
        socialHandles: {},
      }),
    ).rejects.toBeInstanceOf(CreatorNotFoundError);
  });

  it('rejects blank required fields', async () => {
    await seedPendingCreator();

    await expect(
      creatorProfileService.completeOnboarding(UID, {
        bio: '   ',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'mpesa',
        socialHandles: {},
      }),
    ).rejects.toBeInstanceOf(InvalidOnboardingInputError);
  });

  it('rejects an invalid payment preference', async () => {
    await seedPendingCreator();

    await expect(
      creatorProfileService.completeOnboarding(UID, {
        bio: 'Bio',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'crypto' as never,
        socialHandles: {},
      }),
    ).rejects.toBeInstanceOf(InvalidOnboardingInputError);
  });

  it('completes onboarding and persists the profile fields', async () => {
    await seedPendingCreator();

    await creatorProfileService.completeOnboarding(UID, {
      bio: '  Food and lifestyle creator  ',
      niche: '  Food  ',
      followersRange: '1,000–5,000',
      paymentPreference: 'bank',
      socialHandles: { instagram: '@amina' },
    });

    const profile = await creatorRepository.findById(UID);
    expect(profile).toMatchObject({
      bio: 'Food and lifestyle creator',
      niche: 'Food',
      followersRange: '1,000–5,000',
      paymentPreference: 'bank',
      socialHandles: { instagram: '@amina' },
      onboardingCompleted: true,
      status: 'pending', // onboarding never touches approval status
    });
  });

  it('rejects a second attempt once onboarding is already complete', async () => {
    await seedPendingCreator({ onboardingCompleted: true });

    await expect(
      creatorProfileService.completeOnboarding(UID, {
        bio: 'Bio',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'mpesa',
        socialHandles: {},
      }),
    ).rejects.toBeInstanceOf(OnboardingAlreadyCompletedError);
  });
});

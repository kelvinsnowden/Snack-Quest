import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { creatorRepository } from '@/repositories/creatorRepository';
import { userRepository } from '@/repositories/userRepository';
import {
  creatorProfileService,
  InvalidOnboardingInputError,
  InvalidProfileUpdateError,
  OnboardingAlreadyCompletedError,
} from '@/services/creatorProfileService';
import { CreatorNotFoundError } from '@/services/creatorDashboardService';

const UID = 'creator-onboarding-test';
const BUSINESS_ID = 'biz-onboarding-test';

async function seedPendingCreator(
  overrides: Partial<Parameters<typeof creatorRepository.create>[1]> = {},
) {
  await creatorRepository.create(UID, {
    businessId: BUSINESS_ID,
    referralCode: 'TEST1234',
    tier: 'bronze',
    availableCashKes: 0,
    pendingEarningsKes: 0,
    lifetimeEarningsKes: 0,
    commissionRateKes: 500,
    totalClicks: 0,
    totalConversions: 0,
    bio: '',
    niche: '',
    followersRange: '',
    paymentPreference: 'mpesa',
    payoutPhoneNumber: null,
    socialHandles: {},
    onboardingCompleted: false,
    status: 'pending',
    schemaVersion: 1,
    ...overrides,
  });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('creatorProfiles'),
  );
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('domainEvents'),
  );
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

  it('rejects onboarding with no social media handle filled in', async () => {
    await seedPendingCreator();

    await expect(
      creatorProfileService.completeOnboarding(UID, {
        bio: 'Bio',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'mpesa',
        socialHandles: { instagram: '   ' },
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

describe('CreatorProfileService.updateProfile', () => {
  it('throws for a uid with no creator profile', async () => {
    await expect(
      creatorProfileService.updateProfile('no-such-creator', {
        bio: 'Bio',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'mpesa',
        payoutPhoneNumber: null,
        socialHandles: {},
      }),
    ).rejects.toBeInstanceOf(CreatorNotFoundError);
  });

  it('rejects an invalid payout phone number', async () => {
    await seedPendingCreator({ onboardingCompleted: true });

    await expect(
      creatorProfileService.updateProfile(UID, {
        bio: 'Bio',
        niche: 'Food',
        followersRange: '1k-5k',
        paymentPreference: 'mpesa',
        payoutPhoneNumber: '0712345678',
        socialHandles: {},
      }),
    ).rejects.toBeInstanceOf(InvalidProfileUpdateError);
  });

  it('updates the profile fields, including a valid payout phone number', async () => {
    await seedPendingCreator({ onboardingCompleted: true });

    await creatorProfileService.updateProfile(UID, {
      bio: 'Updated bio',
      niche: 'Beauty',
      followersRange: '20,000–100,000',
      paymentPreference: 'mpesa',
      payoutPhoneNumber: '254712345678',
      socialHandles: { tiktok: '@amina.tt' },
    });

    const profile = await creatorRepository.findById(UID);
    expect(profile).toMatchObject({
      bio: 'Updated bio',
      niche: 'Beauty',
      followersRange: '20,000–100,000',
      payoutPhoneNumber: '254712345678',
      socialHandles: { tiktok: '@amina.tt' },
    });
  });

  it('can be called more than once, unlike completeOnboarding', async () => {
    await seedPendingCreator({ onboardingCompleted: true });

    await creatorProfileService.updateProfile(UID, {
      bio: 'First edit',
      niche: 'Food',
      followersRange: '1k-5k',
      paymentPreference: 'mpesa',
      payoutPhoneNumber: null,
      socialHandles: {},
    });
    await creatorProfileService.updateProfile(UID, {
      bio: 'Second edit',
      niche: 'Food',
      followersRange: '1k-5k',
      paymentPreference: 'mpesa',
      payoutPhoneNumber: null,
      socialHandles: {},
    });

    const profile = await creatorRepository.findById(UID);
    expect(profile?.bio).toBe('Second edit');
  });
});

describe('CreatorProfileService.updatePhoto', () => {
  it('throws for a uid with no creator profile', async () => {
    await expect(
      creatorProfileService.updatePhoto('no-such-creator', 'https://example.com/a.png'),
    ).rejects.toBeInstanceOf(CreatorNotFoundError);
  });

  it('rejects a blank string', async () => {
    await seedPendingCreator({ onboardingCompleted: true });
    await userRepository.create(UID, { email: 'creator@example.com', roles: ['creator'], displayName: 'Creator', photoURL: null }, UID);

    await expect(creatorProfileService.updatePhoto(UID, '   ')).rejects.toBeInstanceOf(
      InvalidProfileUpdateError,
    );
  });

  it('sets the photo on the users doc, not the creatorProfiles doc', async () => {
    await seedPendingCreator({ onboardingCompleted: true });
    await userRepository.create(UID, { email: 'creator@example.com', roles: ['creator'], displayName: 'Creator', photoURL: null }, UID);

    await creatorProfileService.updatePhoto(UID, 'https://example.com/a.png');

    const user = await userRepository.findById(UID);
    expect(user?.photoURL).toBe('https://example.com/a.png');
  });

  it('clears the photo with null', async () => {
    await seedPendingCreator({ onboardingCompleted: true });
    await userRepository.create(UID, { email: 'creator@example.com', roles: ['creator'], displayName: 'Creator', photoURL: 'https://example.com/a.png' }, UID);

    await creatorProfileService.updatePhoto(UID, null);

    const user = await userRepository.findById(UID);
    expect(user?.photoURL).toBeNull();
  });
});

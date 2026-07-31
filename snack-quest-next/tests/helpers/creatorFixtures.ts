import { creatorRepository, type CreatorProfileInput } from '@/repositories/creatorRepository';

/** A minimal, fully-shaped `CreatorProfile` fixture for repository/service/route tests. */
export async function seedCreator(uid: string, overrides: Partial<CreatorProfileInput> & { businessId: string }): Promise<void> {
  await creatorRepository.create(uid, {
    referralCode: `REF-${uid}`,
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
    onboardingCompleted: true,
    status: 'pending',
    schemaVersion: 1,
    ...overrides,
  });
}

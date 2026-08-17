import { adminFirestore } from '@/lib/firebase/admin';
import {
  creatorRepository,
  type CreatorProfileInput,
} from '@/repositories/creatorRepository';

/**
 * Wipes `businesses/{businessId}/creatorMemberships` for each given
 * business — the nested-path replacement for the old
 * `adminFirestore.recursiveDelete(adminFirestore.collection('creatorProfiles'))`
 * one-liner every test file's `beforeEach` used to reach for (§ Creator
 * Marketplace migration). Safe to call with a business that has no
 * memberships at all.
 */
export async function clearCreatorMemberships(...businessIds: string[]): Promise<void> {
  await Promise.all(
    businessIds.map((businessId) =>
      adminFirestore.recursiveDelete(
        adminFirestore.collection('businesses').doc(businessId).collection('creatorMemberships'),
      ),
    ),
  );
}

/** A minimal, fully-shaped `CreatorProfile` fixture for repository/service/route tests. */
export async function seedCreator(
  uid: string,
  overrides: Partial<CreatorProfileInput> & { businessId: string },
): Promise<void> {
  await creatorRepository.create(uid, {
    referralCode: `REF-${uid}`,
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
    onboardingCompleted: true,
    status: 'pending',
    schemaVersion: 1,
    ...overrides,
  });
}

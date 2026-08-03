import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { creatorRepository } from '@/repositories/creatorRepository';
import { generateUniqueReferralCode } from '@/lib/creators/referralCode';

const BUSINESS_ID = 'biz-referral-code-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('creatorProfiles'),
  );
});

async function seedCreatorWithCode(uid: string, referralCode: string) {
  await creatorRepository.create(uid, {
    businessId: BUSINESS_ID,
    referralCode,
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
  });
}

describe('generateUniqueReferralCode', () => {
  it('derives a code from the letters in the display name plus a numeric suffix', async () => {
    const code = await generateUniqueReferralCode(BUSINESS_ID, 'Amina Yusuf');
    expect(code).toMatch(/^AMINAY\d{4}$/);
  });

  it('falls back to a generic base when the display name has too few letters', async () => {
    const code = await generateUniqueReferralCode(BUSINESS_ID, '123');
    expect(code).toMatch(/^CREATOR\d{4}$/);
  });

  it('never returns a code already taken in the same business', async () => {
    const taken = await generateUniqueReferralCode(BUSINESS_ID, 'Amina Yusuf');
    await seedCreatorWithCode('creator-a', taken);

    for (let i = 0; i < 10; i++) {
      const next = await generateUniqueReferralCode(BUSINESS_ID, 'Amina Yusuf');
      expect(next).not.toBe(taken);
    }
  });

  it('scopes uniqueness per business — the same code can exist in a different business', async () => {
    const code = await generateUniqueReferralCode(BUSINESS_ID, 'Amina Yusuf');
    await seedCreatorWithCode('creator-a', code);

    await creatorRepository.create('creator-b', {
      businessId: 'a-different-business',
      referralCode: code,
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
    });

    expect(
      await creatorRepository.existsByReferralCode(
        'a-different-business',
        code,
      ),
    ).toBe(true);
  });
});

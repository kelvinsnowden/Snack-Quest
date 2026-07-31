import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { campaignRepository } from '@/repositories/campaignRepository';
import type { Campaign } from '@/types';

const BUSINESS_ID = 'biz-campaign-repo-test';
const OTHER_BUSINESS_ID = 'biz-campaign-repo-other';

function futureDeadline(daysFromNow = 7): Campaign['deadline'] {
  return Timestamp.fromDate(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)) as unknown as Campaign['deadline'];
}

async function seedCampaign(overrides: Partial<Parameters<typeof campaignRepository.create>[0]> = {}) {
  return campaignRepository.create(
    {
      businessId: BUSINESS_ID,
      title: 'Back to School',
      status: 'active',
      commissionRateKes: 100,
      rules: 'Post one reel featuring the box.',
      assetsUrl: 'https://example.com/assets.zip',
      deadline: futureDeadline(),
      targetNiche: 'food',
      schemaVersion: 1,
      ...overrides,
    },
    'staff-1',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('campaigns'));
});

describe('campaignRepository.findById', () => {
  it('finds a campaign scoped to its business', async () => {
    const id = await seedCampaign();
    const found = await campaignRepository.findById(BUSINESS_ID, id);
    expect(found?.title).toBe('Back to School');
  });

  it('returns null for a campaign in a different business', async () => {
    const id = await seedCampaign();
    expect(await campaignRepository.findById(OTHER_BUSINESS_ID, id)).toBeNull();
  });
});

describe('campaignRepository.listActive', () => {
  it('returns only active campaigns for the business, soonest deadline first', async () => {
    await seedCampaign({ title: 'Draft one', status: 'draft' });
    await seedCampaign({ title: 'Far deadline', deadline: futureDeadline(30) });
    await seedCampaign({ title: 'Near deadline', deadline: futureDeadline(2) });
    await seedCampaign({ title: 'Other business campaign', businessId: OTHER_BUSINESS_ID });

    const results = await campaignRepository.listActive(BUSINESS_ID);

    expect(results.map((r) => r.data.title)).toEqual(['Near deadline', 'Far deadline']);
  });
});

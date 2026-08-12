import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { campaignSubmissionRepository } from '@/repositories/campaignSubmissionRepository';

const BUSINESS_ID = 'biz-campaign-submission-repo-test';

async function seedSubmission(overrides: Partial<Parameters<typeof campaignSubmissionRepository.create>[0]> = {}) {
  return campaignSubmissionRepository.create(
    {
      businessId: BUSINESS_ID,
      campaignId: 'campaign-1',
      campaignTitle: 'Back to School',
      creatorId: 'creator-1',
      submissionType: 'social_post',
      imageUrls: [],
      documentUrl: null,
      socialLink: 'https://instagram.com/p/123',
      notes: '',
      status: 'pending',
      adminFeedback: null,
      reviewedBy: null,
      reviewedAt: null,
      ...overrides,
    },
    'creator-1',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('campaignSubmissions'));
});

describe('campaignSubmissionRepository.listByCreator', () => {
  it('returns only the given creator’s submissions for the given business, newest first', async () => {
    await seedSubmission({ campaignTitle: 'First' });
    await seedSubmission({ campaignTitle: 'Second' });
    await seedSubmission({ creatorId: 'creator-2', campaignTitle: 'Someone else' });
    await seedSubmission({ businessId: 'other-business', campaignTitle: 'Other tenant' });

    const results = await campaignSubmissionRepository.listByCreator(BUSINESS_ID, 'creator-1');

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.data.creatorId === 'creator-1')).toBe(true);
  });
});

describe('campaignSubmissionRepository.listByCampaign', () => {
  it('returns only the given campaign’s submissions for the given business, newest first', async () => {
    await seedSubmission({ campaignId: 'campaign-1' });
    await seedSubmission({ campaignId: 'campaign-1', creatorId: 'creator-2' });
    await seedSubmission({ campaignId: 'campaign-2' });
    await seedSubmission({ businessId: 'other-business', campaignId: 'campaign-1' });

    const results = await campaignSubmissionRepository.listByCampaign(BUSINESS_ID, 'campaign-1');

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.data.campaignId === 'campaign-1')).toBe(true);
  });
});

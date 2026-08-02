import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { campaignRepository } from '@/repositories/campaignRepository';
import {
  campaignService,
  CampaignNotFoundError,
  CampaignNotJoinableError,
  InvalidSubmissionError,
} from '@/services/campaignService';
import type { Campaign } from '@/types';

const BUSINESS_ID = 'biz-campaign-service-test';

function deadline(daysFromNow: number): Campaign['deadline'] {
  return Timestamp.fromDate(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)) as unknown as Campaign['deadline'];
}

async function seedCampaign(overrides: Partial<Parameters<typeof campaignRepository.create>[0]> = {}) {
  return campaignRepository.create(
    {
      businessId: BUSINESS_ID,
      title: 'Back to School',
      status: 'active',
      commissionRateKes: 100,
      rules: 'Post one reel.',
      assetsUrl: '',
      deadline: deadline(7),
      targetNiche: 'food',
      schemaVersion: 1,
      ...overrides,
    },
    'staff-1',
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('campaigns'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('campaignSubmissions'));
});

describe('CampaignService.submitDeliverable', () => {
  it('throws CampaignNotFoundError for an unknown campaign', async () => {
    await expect(
      campaignService.submitDeliverable(BUSINESS_ID, {
        campaignId: 'no-such-campaign',
        creatorId: 'creator-1',
        submissionType: 'social_post',
        socialLink: 'https://instagram.com/p/1',
      }),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it('throws CampaignNotJoinableError for a non-active campaign', async () => {
    const campaignId = await seedCampaign({ status: 'paused' });

    await expect(
      campaignService.submitDeliverable(BUSINESS_ID, {
        campaignId,
        creatorId: 'creator-1',
        submissionType: 'social_post',
        socialLink: 'https://instagram.com/p/1',
      }),
    ).rejects.toBeInstanceOf(CampaignNotJoinableError);
  });

  it('throws CampaignNotJoinableError once the deadline has passed', async () => {
    const campaignId = await seedCampaign({ deadline: deadline(-1) });

    await expect(
      campaignService.submitDeliverable(BUSINESS_ID, {
        campaignId,
        creatorId: 'creator-1',
        submissionType: 'social_post',
        socialLink: 'https://instagram.com/p/1',
      }),
    ).rejects.toBeInstanceOf(CampaignNotJoinableError);
  });

  it('throws InvalidSubmissionError when there is no proof at all', async () => {
    const campaignId = await seedCampaign();

    await expect(
      campaignService.submitDeliverable(BUSINESS_ID, {
        campaignId,
        creatorId: 'creator-1',
        submissionType: 'social_post',
      }),
    ).rejects.toBeInstanceOf(InvalidSubmissionError);
  });

  it('creates a pending submission with the campaign title denormalized', async () => {
    const campaignId = await seedCampaign({ title: 'Back to School Push' });

    const submissionId = await campaignService.submitDeliverable(BUSINESS_ID, {
      campaignId,
      creatorId: 'creator-1',
      submissionType: 'social_post',
      socialLink: 'https://instagram.com/p/1',
    });

    const [submission] = await campaignService.listSubmissionsForCreator(BUSINESS_ID, 'creator-1');
    expect(submission.id).toBe(submissionId);
    expect(submission.data).toMatchObject({
      campaignId,
      campaignTitle: 'Back to School Push',
      creatorId: 'creator-1',
      status: 'pending',
      socialLink: 'https://instagram.com/p/1',
    });
  });
});

describe('CampaignService.listActiveCampaigns', () => {
  it('returns an empty list when no campaigns exist yet — no fabricated data', async () => {
    expect(await campaignService.listActiveCampaigns(BUSINESS_ID)).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { campaignRepository } from '@/repositories/campaignRepository';
import {
  campaignService,
  CampaignNotFoundError,
  CampaignNotJoinableError,
  InvalidCampaignInputError,
  InvalidSubmissionError,
  MAX_CAMPAIGN_IMAGES,
  MAX_SUBMISSION_IMAGES,
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
      imageUrls: [],
      documentUrl: null,
      referenceLink: null,
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

  it('accepts images and a document as proof with no link or comment', async () => {
    const campaignId = await seedCampaign();

    const submissionId = await campaignService.submitDeliverable(BUSINESS_ID, {
      campaignId,
      creatorId: 'creator-1',
      submissionType: 'photo',
      imageUrls: ['https://blob.example/a.png', 'https://blob.example/b.png'],
      documentUrl: 'https://blob.example/brief.pdf',
    });

    const [submission] = await campaignService.listSubmissionsForCreator(BUSINESS_ID, 'creator-1');
    expect(submission.id).toBe(submissionId);
    expect(submission.data).toMatchObject({
      imageUrls: ['https://blob.example/a.png', 'https://blob.example/b.png'],
      documentUrl: 'https://blob.example/brief.pdf',
      socialLink: null,
      notes: '',
    });
  });

  it(`rejects more than ${MAX_SUBMISSION_IMAGES} images`, async () => {
    const campaignId = await seedCampaign();

    await expect(
      campaignService.submitDeliverable(BUSINESS_ID, {
        campaignId,
        creatorId: 'creator-1',
        submissionType: 'photo',
        imageUrls: Array.from({ length: MAX_SUBMISSION_IMAGES + 1 }, (_, i) => `https://blob.example/${i}.png`),
      }),
    ).rejects.toBeInstanceOf(InvalidSubmissionError);
  });
});

describe('CampaignService.listActiveCampaigns', () => {
  it('returns an empty list when no campaigns exist yet — no fabricated data', async () => {
    expect(await campaignService.listActiveCampaigns(BUSINESS_ID)).toEqual([]);
  });
});

describe('CampaignService.listAllCampaigns', () => {
  it('returns every campaign regardless of status', async () => {
    await seedCampaign({ title: 'Draft one', status: 'draft' });
    await seedCampaign({ title: 'Active one', status: 'active' });
    await seedCampaign({ title: 'Other business', businessId: 'biz-other' });

    const results = await campaignService.listAllCampaigns(BUSINESS_ID);

    expect(results.map((r) => r.data.title).sort()).toEqual(['Active one', 'Draft one']);
  });
});

describe('CampaignService.createCampaign', () => {
  function validInput(overrides: Partial<Parameters<typeof campaignService.createCampaign>[0]> = {}) {
    return {
      businessId: BUSINESS_ID,
      title: 'Diwali Push',
      status: 'draft' as const,
      commissionRateKes: 150,
      rules: 'Post a reel unboxing the Deluxe box.',
      assetsUrl: null,
      imageUrls: [],
      documentUrl: null,
      referenceLink: null,
      deadline: deadline(14),
      targetNiche: 'food',
      schemaVersion: 1,
      ...overrides,
    };
  }

  it('creates a campaign and persists every field', async () => {
    const campaignId = await campaignService.createCampaign(validInput(), 'staff-1');

    const campaign = await campaignRepository.findById(BUSINESS_ID, campaignId);
    expect(campaign).toMatchObject({
      title: 'Diwali Push',
      status: 'draft',
      commissionRateKes: 150,
      rules: 'Post a reel unboxing the Deluxe box.',
      targetNiche: 'food',
    });
  });

  it('rejects a blank title', async () => {
    await expect(
      campaignService.createCampaign(validInput({ title: '  ' }), 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidCampaignInputError);
  });

  it('rejects a non-positive commission rate', async () => {
    await expect(
      campaignService.createCampaign(validInput({ commissionRateKes: 0 }), 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidCampaignInputError);
  });

  it('rejects blank rules', async () => {
    await expect(
      campaignService.createCampaign(validInput({ rules: '' }), 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidCampaignInputError);
  });

  it('rejects a blank target niche', async () => {
    await expect(
      campaignService.createCampaign(validInput({ targetNiche: '  ' }), 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidCampaignInputError);
  });

  it(`rejects more than ${MAX_CAMPAIGN_IMAGES} images`, async () => {
    await expect(
      campaignService.createCampaign(
        validInput({
          imageUrls: Array.from({ length: MAX_CAMPAIGN_IMAGES + 1 }, (_, i) => `https://blob.example/${i}.png`),
        }),
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(InvalidCampaignInputError);
  });

  it('persists gallery images, a document, and a reference link', async () => {
    const campaignId = await campaignService.createCampaign(
      validInput({
        imageUrls: ['https://blob.example/1.png', 'https://blob.example/2.png'],
        documentUrl: 'https://blob.example/brief.pdf',
        referenceLink: 'https://instagram.com/p/example',
      }),
      'staff-1',
    );

    const campaign = await campaignRepository.findById(BUSINESS_ID, campaignId);
    expect(campaign).toMatchObject({
      imageUrls: ['https://blob.example/1.png', 'https://blob.example/2.png'],
      documentUrl: 'https://blob.example/brief.pdf',
      referenceLink: 'https://instagram.com/p/example',
    });
  });
});

describe('CampaignService.listSubmissionsForCampaign', () => {
  it("returns only the given campaign's submissions", async () => {
    const campaignId = await seedCampaign();
    const otherCampaignId = await seedCampaign({ title: 'Other' });
    await campaignService.submitDeliverable(BUSINESS_ID, {
      campaignId,
      creatorId: 'creator-1',
      submissionType: 'social_post',
      socialLink: 'https://instagram.com/p/1',
    });
    await campaignService.submitDeliverable(BUSINESS_ID, {
      campaignId: otherCampaignId,
      creatorId: 'creator-2',
      submissionType: 'social_post',
      socialLink: 'https://instagram.com/p/2',
    });

    const results = await campaignService.listSubmissionsForCampaign(BUSINESS_ID, campaignId);

    expect(results).toHaveLength(1);
    expect(results[0].data.campaignId).toBe(campaignId);
  });
});

describe('CampaignService.updateCampaign', () => {
  it('throws CampaignNotFoundError for an unknown campaign', async () => {
    await expect(
      campaignService.updateCampaign(BUSINESS_ID, 'no-such-campaign', { title: 'New title' }, 'staff-1'),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it('throws CampaignNotFoundError for a campaign outside the business', async () => {
    const campaignId = await seedCampaign({ businessId: 'biz-other' });

    await expect(
      campaignService.updateCampaign(BUSINESS_ID, campaignId, { title: 'New title' }, 'staff-1'),
    ).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it('updates the status, image, and other editable fields', async () => {
    const campaignId = await seedCampaign({ status: 'draft', assetsUrl: null });

    await campaignService.updateCampaign(
      BUSINESS_ID,
      campaignId,
      { status: 'active', assetsUrl: 'https://blob.example/campaign.png', commissionRateKes: 200 },
      'staff-1',
    );

    const updated = await campaignRepository.findById(BUSINESS_ID, campaignId);
    expect(updated).toMatchObject({
      status: 'active',
      assetsUrl: 'https://blob.example/campaign.png',
      commissionRateKes: 200,
    });
  });

  it('rejects an invalid status transition value', async () => {
    const campaignId = await seedCampaign();

    await expect(
      campaignService.updateCampaign(BUSINESS_ID, campaignId, { status: 'archived' as never }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidCampaignInputError);
  });
});

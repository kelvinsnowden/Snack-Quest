import 'server-only';

import { campaignRepository, type CampaignInput } from '@/repositories/campaignRepository';
import { campaignSubmissionRepository } from '@/repositories/campaignSubmissionRepository';
import { publishEvent } from '@/lib/events/eventBus';
import { MAX_CAMPAIGN_IMAGES, MAX_SUBMISSION_IMAGES } from '@/lib/campaigns/limits';
import type { Campaign, CampaignSubmission, CampaignStatus } from '@/types';

export { MAX_CAMPAIGN_IMAGES, MAX_SUBMISSION_IMAGES };

export class CampaignNotFoundError extends Error {
  constructor(campaignId: string) {
    super(`Campaign ${campaignId} not found`);
    this.name = 'CampaignNotFoundError';
  }
}

export class InvalidCampaignInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCampaignInputError';
  }
}

const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'ended'];

export class CampaignNotJoinableError extends Error {
  constructor(campaignId: string, reason: string) {
    super(`Campaign ${campaignId} is not accepting submissions: ${reason}`);
    this.name = 'CampaignNotJoinableError';
  }
}

export class InvalidSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSubmissionError';
  }
}

export interface SubmitDeliverableInput {
  campaignId: string;
  creatorId: string;
  submissionType: string;
  imageUrls?: string[] | null;
  documentUrl?: string | null;
  socialLink?: string | null;
  notes?: string;
}

/**
 * Owns both sides of brand campaigns: the creator-facing browse/submit
 * flow (§ Creator Portal campaigns browse) and admin authoring (§
 * Admin: Campaigns) — creating a campaign, editing its rules/asset/
 * deadline/commission, and changing its status. Submission moderation
 * (approving/rejecting a creator's proof) still has no admin UI; that
 * remains a documented gap, not silently built here.
 */
class CampaignService {
  async listActiveCampaigns(businessId: string): Promise<{ id: string; data: Campaign }[]> {
    return campaignRepository.listActive(businessId);
  }

  /** § Admin: Campaigns — every campaign regardless of status, for the management list. */
  async listAllCampaigns(businessId: string): Promise<{ id: string; data: Campaign }[]> {
    return campaignRepository.listAll(businessId);
  }

  async createCampaign(input: CampaignInput, actor: string): Promise<string> {
    this.validate(input);
    return campaignRepository.create(input, actor);
  }

  async updateCampaign(
    businessId: string,
    campaignId: string,
    patch: Partial<CampaignInput>,
    actor: string,
  ): Promise<void> {
    const existing = await campaignRepository.findById(businessId, campaignId);
    if (!existing) {
      throw new CampaignNotFoundError(campaignId);
    }
    this.validate(patch);
    await campaignRepository.update(campaignId, patch, actor);
  }

  private validate(input: Partial<CampaignInput>): void {
    if (input.title !== undefined && input.title.trim().length === 0) {
      throw new InvalidCampaignInputError('"title" cannot be empty.');
    }
    if (
      input.commissionRateKes !== undefined &&
      (!Number.isFinite(input.commissionRateKes) || input.commissionRateKes <= 0)
    ) {
      throw new InvalidCampaignInputError('"commissionRateKes" must be a positive number.');
    }
    if (input.rules !== undefined && input.rules.trim().length === 0) {
      throw new InvalidCampaignInputError('"rules" cannot be empty.');
    }
    if (input.targetNiche !== undefined && input.targetNiche.trim().length === 0) {
      throw new InvalidCampaignInputError('"targetNiche" cannot be empty.');
    }
    if (input.status !== undefined && !CAMPAIGN_STATUSES.includes(input.status)) {
      throw new InvalidCampaignInputError(`"status" must be one of: ${CAMPAIGN_STATUSES.join(', ')}.`);
    }
    if (
      input.assetsUrl !== undefined &&
      input.assetsUrl !== null &&
      input.assetsUrl.trim().length === 0
    ) {
      throw new InvalidCampaignInputError('"assetsUrl" must be a non-empty URL string or null.');
    }
    if (input.imageUrls !== undefined) {
      if (!Array.isArray(input.imageUrls) || input.imageUrls.some((url) => typeof url !== 'string' || !url.trim())) {
        throw new InvalidCampaignInputError('"imageUrls" must be an array of non-empty URL strings.');
      }
      if (input.imageUrls.length > MAX_CAMPAIGN_IMAGES) {
        throw new InvalidCampaignInputError(`"imageUrls" can hold at most ${MAX_CAMPAIGN_IMAGES} images.`);
      }
    }
    if (
      input.documentUrl !== undefined &&
      input.documentUrl !== null &&
      input.documentUrl.trim().length === 0
    ) {
      throw new InvalidCampaignInputError('"documentUrl" must be a non-empty URL string or null.');
    }
    if (
      input.referenceLink !== undefined &&
      input.referenceLink !== null &&
      input.referenceLink.trim().length === 0
    ) {
      throw new InvalidCampaignInputError('"referenceLink" must be a non-empty URL string or null.');
    }
  }

  async listSubmissionsForCreator(
    businessId: string,
    creatorId: string,
  ): Promise<{ id: string; data: CampaignSubmission }[]> {
    return campaignSubmissionRepository.listByCreator(businessId, creatorId);
  }

  /** § Admin: Campaigns submissions — every creator's proof for one campaign. */
  async listSubmissionsForCampaign(
    businessId: string,
    campaignId: string,
  ): Promise<{ id: string; data: CampaignSubmission }[]> {
    return campaignSubmissionRepository.listByCampaign(businessId, campaignId);
  }

  async submitDeliverable(businessId: string, input: SubmitDeliverableInput): Promise<string> {
    const campaign = await campaignRepository.findById(businessId, input.campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(input.campaignId);
    }
    if (campaign.status !== 'active') {
      throw new CampaignNotJoinableError(input.campaignId, `status is "${campaign.status}", not "active"`);
    }
    if (campaign.deadline.toMillis() < Date.now()) {
      throw new CampaignNotJoinableError(input.campaignId, 'deadline has passed');
    }

    const imageUrls = (input.imageUrls ?? []).map((url) => url.trim()).filter(Boolean);
    if (imageUrls.length > MAX_SUBMISSION_IMAGES) {
      throw new InvalidSubmissionError(`You can attach at most ${MAX_SUBMISSION_IMAGES} images.`);
    }
    const documentUrl = input.documentUrl?.trim() || null;
    const socialLink = input.socialLink?.trim() || null;
    const notes = input.notes?.trim() ?? '';
    if (imageUrls.length === 0 && !documentUrl && !socialLink && !notes) {
      throw new InvalidSubmissionError('Provide at least a social link, an image, a document, or a comment as proof.');
    }
    if (!input.submissionType.trim()) {
      throw new InvalidSubmissionError('"submissionType" is required.');
    }

    const submissionId = await campaignSubmissionRepository.create(
      {
        businessId,
        campaignId: input.campaignId,
        campaignTitle: campaign.title,
        creatorId: input.creatorId,
        submissionType: input.submissionType.trim(),
        imageUrls,
        documentUrl,
        socialLink,
        notes,
        status: 'pending',
        adminFeedback: null,
        reviewedBy: null,
        reviewedAt: null,
      },
      input.creatorId,
    );

    await publishEvent(businessId, 'CampaignSubmissionCreated', 'campaignSubmission', submissionId, {
      campaignId: input.campaignId,
      creatorId: input.creatorId,
    });

    return submissionId;
  }
}

export const campaignService = new CampaignService();

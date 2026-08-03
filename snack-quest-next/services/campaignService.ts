import 'server-only';

import { campaignRepository, type CampaignInput } from '@/repositories/campaignRepository';
import { campaignSubmissionRepository } from '@/repositories/campaignSubmissionRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { Campaign, CampaignSubmission, CampaignStatus } from '@/types';

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
  fileUrl?: string | null;
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
  }

  async listSubmissionsForCreator(
    businessId: string,
    creatorId: string,
  ): Promise<{ id: string; data: CampaignSubmission }[]> {
    return campaignSubmissionRepository.listByCreator(businessId, creatorId);
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

    const fileUrl = input.fileUrl?.trim() || null;
    const socialLink = input.socialLink?.trim() || null;
    const notes = input.notes?.trim() ?? '';
    if (!fileUrl && !socialLink && !notes) {
      throw new InvalidSubmissionError('Provide at least a social link, a file, or a note as proof.');
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
        fileUrl,
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

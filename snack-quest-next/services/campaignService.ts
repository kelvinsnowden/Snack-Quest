import 'server-only';

import { campaignRepository } from '@/repositories/campaignRepository';
import { campaignSubmissionRepository } from '@/repositories/campaignSubmissionRepository';
import { publishEvent } from '@/lib/events/eventBus';
import type { Campaign, CampaignSubmission } from '@/types';

export class CampaignNotFoundError extends Error {
  constructor(campaignId: string) {
    super(`Campaign ${campaignId} not found`);
    this.name = 'CampaignNotFoundError';
  }
}

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
 * Owns the creator-facing side of brand campaigns (§ Creator Portal
 * campaigns browse) — browsing what's currently joinable and
 * submitting proof of a deliverable. Campaign creation/moderation
 * (approving/rejecting a submission) is admin-side work that doesn't
 * exist yet (no admin campaigns UI is built) — `listActiveCampaigns`
 * will honestly return an empty list until one does; this Service
 * doesn't fabricate campaigns to fill that gap.
 */
class CampaignService {
  async listActiveCampaigns(businessId: string): Promise<{ id: string; data: Campaign }[]> {
    return campaignRepository.listActive(businessId);
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

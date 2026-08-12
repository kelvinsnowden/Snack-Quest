import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  campaignService,
  CampaignNotFoundError,
  InvalidCampaignInputError,
} from '@/services/campaignService';
import { campaignRepository, type CampaignInput } from '@/repositories/campaignRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { Campaign, CampaignStatus } from '@/types';

interface UpdateCampaignBody {
  title?: unknown;
  status?: unknown;
  commissionRateKes?: unknown;
  rules?: unknown;
  targetNiche?: unknown;
  deadline?: unknown;
  assetsUrl?: unknown;
  imageUrls?: unknown;
  documentUrl?: unknown;
  referenceLink?: unknown;
}

const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'ended'];

function buildPatch(body: UpdateCampaignBody): { patch: Partial<CampaignInput> } | { error: string } {
  const patch: Partial<CampaignInput> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      return { error: '"title" must be a non-empty string when provided.' };
    }
    patch.title = body.title.trim();
  }
  if (body.status !== undefined) {
    if (!CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
      return { error: `"status" must be one of: ${CAMPAIGN_STATUSES.join(', ')}.` };
    }
    patch.status = body.status as CampaignStatus;
  }
  if (body.commissionRateKes !== undefined) {
    if (
      typeof body.commissionRateKes !== 'number' ||
      !Number.isFinite(body.commissionRateKes) ||
      body.commissionRateKes <= 0
    ) {
      return { error: '"commissionRateKes" must be a positive number when provided.' };
    }
    patch.commissionRateKes = body.commissionRateKes;
  }
  if (body.rules !== undefined) {
    if (typeof body.rules !== 'string' || body.rules.trim().length === 0) {
      return { error: '"rules" must be a non-empty string when provided.' };
    }
    patch.rules = body.rules.trim();
  }
  if (body.targetNiche !== undefined) {
    if (typeof body.targetNiche !== 'string' || body.targetNiche.trim().length === 0) {
      return { error: '"targetNiche" must be a non-empty string when provided.' };
    }
    patch.targetNiche = body.targetNiche.trim();
  }
  if (body.deadline !== undefined) {
    if (typeof body.deadline !== 'string' || Number.isNaN(new Date(body.deadline).getTime())) {
      return { error: '"deadline" must be a valid date string when provided.' };
    }
    patch.deadline = new Date(body.deadline) as unknown as Campaign['deadline'];
  }
  if (body.assetsUrl !== undefined) {
    if (body.assetsUrl !== null && typeof body.assetsUrl !== 'string') {
      return { error: '"assetsUrl" must be a string or null when provided.' };
    }
    patch.assetsUrl = body.assetsUrl;
  }
  if (body.imageUrls !== undefined) {
    if (!Array.isArray(body.imageUrls) || body.imageUrls.some((url) => typeof url !== 'string')) {
      return { error: '"imageUrls" must be an array of strings when provided.' };
    }
    patch.imageUrls = body.imageUrls;
  }
  if (body.documentUrl !== undefined) {
    if (body.documentUrl !== null && typeof body.documentUrl !== 'string') {
      return { error: '"documentUrl" must be a string or null when provided.' };
    }
    patch.documentUrl = body.documentUrl;
  }
  if (body.referenceLink !== undefined) {
    if (body.referenceLink !== null && typeof body.referenceLink !== 'string') {
      return { error: '"referenceLink" must be a string or null when provided.' };
    }
    patch.referenceLink = body.referenceLink;
  }

  return { patch };
}

/** Edits a brand campaign, including its status and creative asset (§ Admin: Campaigns). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { campaignId } = await params;

  const existing = await campaignRepository.findById(session.businessId, campaignId);
  if (!existing) {
    return Response.json({ error: `Campaign ${campaignId} not found` }, { status: 404 });
  }

  let body: UpdateCampaignBody;
  try {
    body = (await request.json()) as UpdateCampaignBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const result = buildPatch(body);
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  try {
    await campaignService.updateCampaign(session.businessId, campaignId, result.patch, session.uid);
    const updated = await campaignRepository.findById(session.businessId, campaignId);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'campaign.update',
      entityType: 'campaign',
      entityId: campaignId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    return Response.json({ campaign: updated });
  } catch (error) {
    if (error instanceof CampaignNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidCampaignInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

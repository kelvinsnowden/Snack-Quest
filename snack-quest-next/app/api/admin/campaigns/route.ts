import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { campaignService, InvalidCampaignInputError } from '@/services/campaignService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { Campaign, CampaignStatus } from '@/types';

interface CreateCampaignBody {
  title?: unknown;
  status?: unknown;
  commissionRateKes?: unknown;
  rules?: unknown;
  targetNiche?: unknown;
  deadline?: unknown;
  assetsUrl?: unknown;
}

const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'ended'];

function validate(body: CreateCampaignBody): { error: string } | null {
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    return { error: '"title" is required.' };
  }
  if (
    typeof body.commissionRateKes !== 'number' ||
    !Number.isFinite(body.commissionRateKes) ||
    body.commissionRateKes <= 0
  ) {
    return { error: '"commissionRateKes" must be a positive number.' };
  }
  if (typeof body.rules !== 'string' || body.rules.trim().length === 0) {
    return { error: '"rules" is required.' };
  }
  if (typeof body.targetNiche !== 'string' || body.targetNiche.trim().length === 0) {
    return { error: '"targetNiche" is required.' };
  }
  if (typeof body.deadline !== 'string' || Number.isNaN(new Date(body.deadline).getTime())) {
    return { error: '"deadline" must be a valid date string.' };
  }
  if (body.status !== undefined && !CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
    return { error: `"status" must be one of: ${CAMPAIGN_STATUSES.join(', ')}.` };
  }
  if (body.assetsUrl !== undefined && body.assetsUrl !== null && typeof body.assetsUrl !== 'string') {
    return { error: '"assetsUrl" must be a string or null when provided.' };
  }
  return null;
}

/** Creates a brand campaign (§ Admin: Campaigns). */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CreateCampaignBody;
  try {
    body = (await request.json()) as CreateCampaignBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return Response.json(validationError, { status: 400 });
  }

  const campaignInput = {
    businessId: session.businessId,
    title: (body.title as string).trim(),
    status: (body.status as CampaignStatus | undefined) ?? 'draft',
    commissionRateKes: body.commissionRateKes as number,
    rules: (body.rules as string).trim(),
    targetNiche: (body.targetNiche as string).trim(),
    deadline: new Date(body.deadline as string) as unknown as Campaign['deadline'],
    assetsUrl: (body.assetsUrl as string | null | undefined) ?? null,
    schemaVersion: 1,
  };

  try {
    const campaignId = await campaignService.createCampaign(campaignInput, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'campaign.create',
      entityType: 'campaign',
      entityId: campaignId,
      after: campaignInput,
    });

    return Response.json({ campaignId }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidCampaignInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

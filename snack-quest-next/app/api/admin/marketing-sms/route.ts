import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingSmsService, MarketingSmsValidationError } from '@/services/marketingSmsService';
import { parseSmsDraftBody, type SmsDraftBody } from '@/lib/marketingSms/parseDraftBody';
import { serializeSmsCampaign } from '@/lib/marketingSms/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * `/api/admin/marketing-sms` (§ Admin: Marketing SMS). Super admin only,
 * matching Marketing Emails — but the stake is higher here, since every
 * recipient costs money and nothing is recallable once the aggregator
 * has it.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
  const { campaigns, nextCursor } = await marketingSmsService.listCampaigns(session.businessId, { cursor });
  return Response.json({
    campaigns: campaigns.map(({ id, data }) => serializeSmsCampaign(id, data)),
    nextCursor,
  });
}

/** Creates a draft. Never sends — sending is its own explicit action, because it spends money. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: SmsDraftBody;
  try {
    body = (await request.json()) as SmsDraftBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = parseSmsDraftBody(body);
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const campaignId = await marketingSmsService.createDraft(session.businessId, parsed.input, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_sms.create_draft',
      entityType: 'marketingSmsCampaign',
      entityId: campaignId,
      after: { name: parsed.input.name, segment: parsed.input.segment },
    });

    return Response.json({ campaignId }, { status: 201 });
  } catch (error) {
    if (error instanceof MarketingSmsValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

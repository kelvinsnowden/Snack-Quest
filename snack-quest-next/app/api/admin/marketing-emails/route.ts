import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingEmailService, MarketingEmailValidationError } from '@/services/marketingEmailService';
import { parseDraftBody, type DraftBody } from '@/lib/marketingEmails/parseDraftBody';
import { serializeCampaign } from '@/lib/marketingEmails/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Lists this business's marketing email campaigns, newest first (§ Admin: Marketing Emails). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
  const { campaigns, nextCursor } = await marketingEmailService.listCampaigns(session.businessId, { cursor });
  return Response.json({ campaigns: campaigns.map(({ id, data }) => serializeCampaign(id, data)), nextCursor });
}

/** Creates a new draft campaign — never sends anything (§ Admin: Marketing Emails). */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: DraftBody;
  try {
    body = (await request.json()) as DraftBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = parseDraftBody(body);
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const campaignId = await marketingEmailService.createDraft(session.businessId, parsed.input, session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'marketing_email.create_draft',
      entityType: 'marketingEmailCampaign',
      entityId: campaignId,
      after: { subject: parsed.input.subject, segment: parsed.input.segment },
    });

    return Response.json({ campaignId }, { status: 201 });
  } catch (error) {
    if (error instanceof MarketingEmailValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

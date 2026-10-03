import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, iso, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService, type CampaignInput } from '@/services/advertisingService';

/** Campaigns (§ CAMPAIGNS). List with `advertising.view`; create a draft with `advertising.manage`. */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.view']);
  if (session instanceof Response) return session;
  const rows = await advertisingService.listCampaigns(session.businessId);
  return Response.json({ campaigns: rows.map(({ id, data }) => ({ id, ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), publishedAt: iso(data.publishedAt) })) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.manage']);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (!body || typeof body.advertiserId !== 'string') return Response.json({ error: '"advertiserId" is required.' }, { status: 400 });
  try {
    const id = await advertisingService.createCampaign(session.businessId, body as unknown as CampaignInput, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'ad_campaign.create', entityType: 'adCampaign', entityId: id, after: body });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return adErrorResponse(error);
  }
}

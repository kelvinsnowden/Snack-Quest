import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, iso, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService, type CampaignInput } from '@/services/advertisingService';

type Params = { params: Promise<{ id: string }> };

/** One campaign. Read with `advertising.view`; edit a draft or paused campaign with `advertising.manage`. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const session = await staffWith(request, ['advertising.view']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const campaign = await advertisingService.getCampaign(session.businessId, id);
  if (!campaign) return Response.json({ error: `Campaign ${id} not found` }, { status: 404 });
  return Response.json({ campaign: { id, ...campaign, createdAt: iso(campaign.createdAt), updatedAt: iso(campaign.updatedAt), publishedAt: iso(campaign.publishedAt) } });
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const session = await staffWith(request, ['advertising.manage']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const { before, after } = await advertisingService.updateCampaign(session.businessId, id, body as unknown as Omit<CampaignInput, 'advertiserId'>);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'ad_campaign.update', entityType: 'adCampaign', entityId: id, before: { name: before.name, creativeIds: before.creativeIds, schedule: before.schedule, targeting: before.targeting, weight: before.weight, billingModel: before.billingModel, priceKes: before.priceKes }, after });
    return Response.json({ updated: true });
  } catch (error) {
    return adErrorResponse(error);
  }
}

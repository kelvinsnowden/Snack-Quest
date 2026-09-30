import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

const ACTIONS = ['start', 'pause', 'end', 'cancel'] as const;

/** Starts, pauses, ends or cancels a campaign (`advertising.publish`). Starting needs every creative approved. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['advertising.publish']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  const action = body?.action;
  if (!(ACTIONS as readonly unknown[]).includes(action)) return Response.json({ error: `"action" must be one of: ${ACTIONS.join(', ')}.` }, { status: 400 });
  try {
    const result =
      action === 'start'
        ? await advertisingService.publishCampaign(session.businessId, id, session.uid)
        : await advertisingService.setCampaignStatus(session.businessId, id, action === 'pause' ? 'paused' : action === 'end' ? 'ended' : 'cancelled');
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: `ad_campaign.${action}`, entityType: 'adCampaign', entityId: id, before: { status: result.before.status }, after: { status: result.after.status } });
    return Response.json({ status: result.after.status });
  } catch (error) {
    return adErrorResponse(error);
  }
}

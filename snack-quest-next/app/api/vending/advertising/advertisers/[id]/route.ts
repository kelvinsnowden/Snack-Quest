import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

/** Edits an advertiser's details or deactivates them (`advertising.manage`). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['advertising.manage']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    await advertisingService.updateAdvertiser(session.businessId, id, body);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'advertiser.update', entityType: 'advertiser', entityId: id, after: body });
    return Response.json({ updated: true });
  } catch (error) {
    return adErrorResponse(error);
  }
}

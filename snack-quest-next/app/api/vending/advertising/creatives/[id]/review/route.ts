import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

/** Approves or rejects a creative (`advertising.review`). `{ decision: 'approved' | 'rejected', note }`; rejecting needs a note. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await staffWith(request, ['advertising.review']);
  if (session instanceof Response) return session;
  const { id } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const { before, after } = await advertisingService.reviewCreative(session.businessId, id, body.decision, body.note, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'ad_creative.review', entityType: 'adCreative', entityId: id, before: { status: before.status }, after });
    return Response.json({ status: after.status });
  } catch (error) {
    return adErrorResponse(error);
  }
}

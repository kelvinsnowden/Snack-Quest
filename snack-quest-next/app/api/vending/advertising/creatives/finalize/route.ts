import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

/**
 * Records a directly uploaded ad video as a creative: `{ advertiserId,
 * name, url, durationSeconds }` (`advertising.manage`). The stored file is
 * re-read and checked here — its type, size and bytes — and its checksum
 * computed; it then waits for review like any other creative.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.manage']);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  if (typeof body.advertiserId !== 'string' || !body.advertiserId) return Response.json({ error: '"advertiserId" is required.' }, { status: 400 });
  try {
    const { id, creative } = await advertisingService.finalizeDirectVideo({ businessId: session.businessId, advertiserId: body.advertiserId, name: body.name, url: body.url, durationSeconds: body.durationSeconds, actor: session.uid });
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'ad_creative.upload', entityType: 'adCreative', entityId: id, after: { name: creative.name, mimeType: creative.mimeType, bytes: creative.bytes, sha256: creative.sha256, direct: true } });
    return Response.json({ id, creative }, { status: 201 });
  } catch (error) {
    return adErrorResponse(error);
  }
}

import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, iso, readBody, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

/** Advertisers (§ ADVERTISING). List with `advertising.view`; add with `advertising.manage`. */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.view']);
  if (session instanceof Response) return session;
  const rows = await advertisingService.listAdvertisers(session.businessId);
  return Response.json({ advertisers: rows.map(({ id, data }) => ({ id, ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) })) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.manage']);
  if (session instanceof Response) return session;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const id = await advertisingService.createAdvertiser(session.businessId, body, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'advertiser.create', entityType: 'advertiser', entityId: id, after: { name: body.name, kind: body.kind ?? 'external' } });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return adErrorResponse(error);
  }
}

import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, iso, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

/**
 * Ad creatives (§ CREATIVES, § AD SECURITY). List with `advertising.view`.
 * Upload (multipart: `file`, `advertiserId`, `name`, `durationSeconds`)
 * with `advertising.manage`: the file's bytes are checked against its
 * type and its checksum computed here; it waits for review before any
 * machine can play it.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.view']);
  if (session instanceof Response) return session;
  const rows = await advertisingService.listCreatives(session.businessId);
  return Response.json({ creatives: rows.map(({ id, data }) => ({ id, ...data, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), reviewedAt: iso(data.reviewedAt) })) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.manage']);
  if (session instanceof Response) return session;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }
  const file = form.get('file');
  const advertiserId = form.get('advertiserId');
  if (!(file instanceof File)) return Response.json({ error: '"file" is required.' }, { status: 400 });
  if (typeof advertiserId !== 'string' || !advertiserId) return Response.json({ error: '"advertiserId" is required.' }, { status: 400 });
  try {
    const { id, creative } = await advertisingService.uploadCreative({
      businessId: session.businessId,
      advertiserId,
      name: form.get('name'),
      filename: file.name,
      contentType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
      durationSeconds: form.get('durationSeconds'),
      actor: session.uid,
    });
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'ad_creative.upload', entityType: 'adCreative', entityId: id, after: { name: creative.name, mimeType: creative.mimeType, bytes: creative.bytes, sha256: creative.sha256 } });
    return Response.json({ id, creative }, { status: 201 });
  } catch (error) {
    return adErrorResponse(error);
  }
}

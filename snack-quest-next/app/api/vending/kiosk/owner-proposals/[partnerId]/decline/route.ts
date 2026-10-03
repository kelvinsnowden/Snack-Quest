import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { ownerDesignErrorResponse } from '@/lib/kiosk/ownerDesignHttp';
import { kioskOwnerDesignService } from '@/services/kioskOwnerDesignService';

/** Send an owner's proposal back with a reason: `{ note, seenUpdatedAtMillis? }` (`kiosk.publish`). */
export async function POST(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await staffWith(request, ['kiosk.publish']);
  if (session instanceof Response) return session;
  const { partnerId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    await kioskOwnerDesignService.decline(session.businessId, partnerId, session.uid, typeof body.note === 'string' ? body.note : '', typeof body.seenUpdatedAtMillis === 'number' ? body.seenUpdatedAtMillis : undefined);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'kiosk.owner_proposal.decline', entityType: 'kioskOwnerProposal', entityId: partnerId, after: { note: body.note } });
    return Response.json({ ok: true });
  } catch (error) {
    return ownerDesignErrorResponse(error);
  }
}

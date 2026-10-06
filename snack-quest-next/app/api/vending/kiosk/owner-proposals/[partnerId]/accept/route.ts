import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { readBody, staffWith } from '@/lib/ads/routeHelpers';
import { ownerDesignErrorResponse } from '@/lib/kiosk/ownerDesignHttp';
import { kioskOwnerDesignService } from '@/services/kioskOwnerDesignService';

/** Publish an owner's proposal on their layer: `{ note, seenUpdatedAtMillis? }` (`kiosk.publish`). Checked like any publish. */
export async function POST(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await staffWith(request, ['kiosk.publish']);
  if (session instanceof Response) return session;
  const { partnerId } = await params;
  const body = await readBody(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const published = await kioskOwnerDesignService.accept(session.businessId, partnerId, session.uid, typeof body.note === 'string' ? body.note : '', typeof body.seenUpdatedAtMillis === 'number' ? body.seenUpdatedAtMillis : undefined);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'kiosk.owner_proposal.accept', entityType: 'kioskOwnerProposal', entityId: partnerId, after: { versionNumber: published.versionNumber } });
    return Response.json({ versionNumber: published.versionNumber, warnings: published.warnings });
  } catch (error) {
    return ownerDesignErrorResponse(error);
  }
}

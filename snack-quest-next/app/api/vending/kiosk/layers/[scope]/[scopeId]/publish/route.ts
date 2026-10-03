import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { kioskErrorResponse, readJson } from '@/lib/kiosk/routeErrors';
import { kioskExperienceService } from '@/services/kioskExperienceService';
import type { KioskLayerScope } from '@/types';

/** Publishes a layer's saved draft as a new immutable version (`kiosk.publish`). Refused (409) when the result would be unreadable or unusable. */
export async function POST(request: Request, { params }: { params: Promise<{ scope: string; scopeId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.publish')) return forbiddenForPermission('kiosk.publish');
  const { scope, scopeId } = await params;
  const body = await readJson(request);
  if (!body) return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  try {
    const result = await kioskExperienceService.publish(session.businessId, scope as KioskLayerScope, scopeId, typeof body.note === 'string' ? body.note : '', session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'kiosk_layer.publish',
      entityType: 'kioskLayer',
      entityId: `${scope}:${scopeId}`,
      after: { versionNumber: result.versionNumber, note: body.note ?? null },
      machineId: scope === 'machine' ? scopeId : null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return kioskErrorResponse(error);
  }
}

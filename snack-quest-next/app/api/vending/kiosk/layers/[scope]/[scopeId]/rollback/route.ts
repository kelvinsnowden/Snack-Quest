import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { kioskErrorResponse, readJson } from '@/lib/kiosk/routeErrors';
import { kioskExperienceService } from '@/services/kioskExperienceService';
import type { KioskLayerScope } from '@/types';

/** Publishes an earlier version again as a new version (`kiosk.publish`). History is never rewritten. */
export async function POST(request: Request, { params }: { params: Promise<{ scope: string; scopeId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.publish')) return forbiddenForPermission('kiosk.publish');
  const { scope, scopeId } = await params;
  const body = await readJson(request);
  const versionNumber = body?.versionNumber;
  if (typeof versionNumber !== 'number' || !Number.isInteger(versionNumber) || versionNumber < 1) {
    return Response.json({ error: '"versionNumber" must be a version number.' }, { status: 400 });
  }
  try {
    const result = await kioskExperienceService.rollback(session.businessId, scope as KioskLayerScope, scopeId, versionNumber, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'kiosk_layer.rollback',
      entityType: 'kioskLayer',
      entityId: `${scope}:${scopeId}`,
      after: { versionNumber: result.versionNumber, rolledBackFrom: versionNumber },
      machineId: scope === 'machine' ? scopeId : null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return kioskErrorResponse(error);
  }
}

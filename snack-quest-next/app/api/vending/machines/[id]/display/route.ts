import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { kioskErrorResponse, readJson } from '@/lib/kiosk/routeErrors';
import { kioskExperienceService } from '@/services/kioskExperienceService';

/** A machine's screen size and orientation (§ DEVICE PROFILES), for previews. `kiosk.design`. Send `{ display: null }` to clear it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'kiosk.design')) return forbiddenForPermission('kiosk.design');
  const { id } = await params;
  const body = await readJson(request);
  if (!body || !('display' in body)) return Response.json({ error: '"display" is required.' }, { status: 400 });
  try {
    const result = await kioskExperienceService.setDisplayProfile(session.businessId, id, body.display, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'machine.set_display_profile',
      entityType: 'machine',
      entityId: id,
      before: { display: result.before },
      after: { display: result.after },
      machineId: id,
    });
    return Response.json({ display: result.after });
  } catch (error) {
    return kioskErrorResponse(error);
  }
}

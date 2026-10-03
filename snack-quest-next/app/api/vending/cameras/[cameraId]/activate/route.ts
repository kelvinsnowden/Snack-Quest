import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { cameraService, CameraNotFoundError, CameraNotTestedError } from '@/services/cameraService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** POST — the one and only path to `active` (§10 step 7). `ADMIN_ONLY`: activating changes what's actually live, the same "real consequence" bar `Test vend` uses for vending hardware. */
export async function POST(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'cameras.manage')) {
    return forbiddenForPermission('cameras.manage');
  }

  const { cameraId } = await params;
  try {
    await cameraService.activateCamera(session.businessId, cameraId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'activate_camera',
      entityType: 'camera',
      entityId: cameraId,
      after: { status: 'active' },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CameraNotTestedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

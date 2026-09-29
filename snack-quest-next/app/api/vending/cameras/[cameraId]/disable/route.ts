import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { cameraService, CameraNotFoundError, IllegalCameraTransitionError } from '@/services/cameraService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** POST — takes a camera out of service. `ADMIN_ONLY`, same tier as `activate`. */
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
    await cameraService.disableCamera(session.businessId, cameraId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'disable_camera',
      entityType: 'camera',
      entityId: cameraId,
      after: { status: 'disabled' },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalCameraTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

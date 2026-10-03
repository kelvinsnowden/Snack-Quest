import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { cameraService, CameraNotFoundError } from '@/services/cameraService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** POST — "Test connection" (§9/§10 step 4): `connect()` then `disconnect()`. Never destructive, so the same read-diagnostics-tier role as the rest of the machine diagnostics panel. */
export async function POST(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'cameras.operate')) {
    return forbiddenForPermission('cameras.operate');
  }

  const { cameraId } = await params;
  try {
    const result = await cameraService.testConnection(session.businessId, cameraId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'test_camera_connection',
      entityType: 'camera',
      entityId: cameraId,
      after: result,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

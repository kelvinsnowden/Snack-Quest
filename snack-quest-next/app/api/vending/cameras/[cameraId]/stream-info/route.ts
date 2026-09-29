import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { cameraService, CameraNotFoundError, CameraCapabilityNotSupportedError } from '@/services/cameraService';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** GET — "View stream information" (§9). Requires `camera_stream`. Deliberately never a full authenticated URI (§ SECURITY) — see `CameraStreamInfo`'s own doc comment. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'cameras.view')) {
    return forbiddenForPermission('cameras.view');
  }

  const { cameraId } = await params;
  try {
    const streamInfo = await cameraService.getStreamInfo(session.businessId, cameraId);
    return Response.json({ streamInfo });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CameraCapabilityNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

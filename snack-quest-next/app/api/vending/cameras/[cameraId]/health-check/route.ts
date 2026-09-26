import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { cameraService, CameraNotFoundError, CameraCapabilityNotSupportedError } from '@/services/cameraService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** POST — "Run health check" (§8/§9), distinct from "Test connection". Requires `camera_health`; if this camera is currently `active`, a failing check independently marks the camera `error` — never the machine, never vending (§8's own instruction). */
export async function POST(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { cameraId } = await params;
  try {
    const result = await cameraService.runHealthCheck(session.businessId, cameraId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'camera_health_check',
      entityType: 'camera',
      entityId: cameraId,
      after: result,
    });
    return Response.json(result);
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

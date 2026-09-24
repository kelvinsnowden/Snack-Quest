import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, CameraNotFoundError } from '@/services/ownerPortalService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** POST — "Test Connection" (§ CAMERA tab), owner-scoped. */
export async function POST(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { cameraId } = await params;
  try {
    const result = await ownerPortalService.testCameraConnectionForOwner(session.businessId, session.partnerId, cameraId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'test_camera_connection',
      entityType: 'camera',
      entityId: cameraId,
      after: result,
      source: 'owner_portal',
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

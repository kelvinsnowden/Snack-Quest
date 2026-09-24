import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, CameraNotFoundError } from '@/services/ownerPortalService';
import { CameraCapabilityNotSupportedError } from '@/services/cameraService';

/** GET — owner-scoped stream info. Never an authenticated URI (§ SECURITY) — see `CameraStreamInfo`'s own doc comment. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { cameraId } = await params;
  try {
    const streamInfo = await ownerPortalService.getCameraStreamInfoForOwner(session.businessId, session.partnerId, cameraId);
    return Response.json({ streamInfo });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof CameraCapabilityNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

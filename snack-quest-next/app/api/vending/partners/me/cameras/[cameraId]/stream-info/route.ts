import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, CameraNotFoundError } from '@/services/ownerPortalService';
import { CameraCapabilityNotSupportedError } from '@/services/cameraService';

/** GET — the owner's live-view capability. Never the camera's host, port, path or credentials — see `OwnerLiveViewCapability`. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { cameraId } = await params;
  try {
    const liveView = await ownerPortalService.getCameraStreamInfoForOwner(session.businessId, session.partnerId, cameraId);
    return Response.json({ liveView });
  } catch (error) {
    if (error instanceof CameraNotFoundError) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    if (error instanceof CameraCapabilityNotSupportedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

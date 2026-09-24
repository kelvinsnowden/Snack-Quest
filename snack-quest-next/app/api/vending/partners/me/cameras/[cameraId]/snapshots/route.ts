import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, CameraNotFoundError } from '@/services/ownerPortalService';
import { serializeCameraSnapshot } from '@/lib/vending/serialize';

/** GET — "View Snapshots" (§ CAMERA tab), owner-scoped capture history. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { cameraId } = await params;
  try {
    const snapshots = await ownerPortalService.listCameraSnapshotsForOwner(session.businessId, session.partnerId, cameraId);
    return Response.json({ snapshots: snapshots.map(({ id, data }) => serializeCameraSnapshot(id, data)) });
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

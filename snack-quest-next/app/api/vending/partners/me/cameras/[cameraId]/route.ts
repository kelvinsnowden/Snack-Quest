import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError, CameraNotFoundError } from '@/services/ownerPortalService';
import { serializeCamera } from '@/lib/vending/serialize';

/** GET — one owned camera plus its live capability read. */
export async function GET(request: Request, { params }: { params: Promise<{ cameraId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { cameraId } = await params;
  try {
    const { camera, diagnostics } = await ownerPortalService.getCameraDiagnosticsForOwner(session.businessId, session.partnerId, cameraId);
    return Response.json({ camera: serializeCamera(cameraId, camera), diagnostics });
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

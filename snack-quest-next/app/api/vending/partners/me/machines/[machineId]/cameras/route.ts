import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeCamera } from '@/lib/vending/serialize';

/** GET — every camera on one owned machine (§ CAMERA tab). */
export async function GET(request: Request, { params }: { params: Promise<{ machineId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { machineId } = await params;
  try {
    const cameras = await ownerPortalService.listCamerasForMachine(session.businessId, session.partnerId, machineId);
    return Response.json({ cameras: cameras.map(({ id, data }) => serializeCamera(id, data)) });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

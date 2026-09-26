import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
import { MachineNotFoundError } from '@/repositories/machineRepository';

/** § INVENTORY tab — one owned machine's own slots. */
export async function GET(request: Request, { params }: { params: Promise<{ machineId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { machineId } = await params;
  try {
    const inventory = await ownerPortalService.getMachineInventory(session.businessId, session.partnerId, machineId);
    return Response.json({ inventory });
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

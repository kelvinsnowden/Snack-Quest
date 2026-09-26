import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
import { MachineNotFoundError } from '@/repositories/machineRepository';

/**
 * One machine's own Owner Portal detail (§ MACHINE DETAIL). Ownership
 * is enforced inside `ownerPortalService.getMachineDetail` itself
 * (via `machineService.assertPartnerOwnsMachine`) — a partner trying
 * another owner's `machineId` gets the same 403 every other
 * partner-scoped read in this codebase already gives, never a leak of
 * whether the machine exists at all.
 */
export async function GET(request: Request, { params }: { params: Promise<{ machineId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { machineId } = await params;
  try {
    const detail = await ownerPortalService.getMachineDetail(session.businessId, session.partnerId, machineId);
    return Response.json({ machine: detail });
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

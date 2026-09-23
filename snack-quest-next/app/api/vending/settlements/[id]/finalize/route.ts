import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSettlementService, MachineSettlementNotFoundError, IllegalSettlementTransitionError } from '@/services/machineSettlementService';

/**
 * Finalizes a `draft` settlement and credits `distributableOwnerKes +
 * adjustmentKes` to the partner's wallet, exactly once
 * (§ SETTLEMENT: "must be idempotent. Do not double-credit an owner if
 * settlement runs twice") — see `MachineSettlementService.finalize`'s
 * own doc comment for the transactional guarantee. `ADMIN_ONLY`: this
 * is the one write in this whole domain that actually moves money into
 * a partner's withdrawable balance.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  try {
    await machineSettlementService.finalize(session.businessId, id, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineSettlementNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalSettlementTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

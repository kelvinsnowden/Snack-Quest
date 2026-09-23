import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineService, MachineNotFoundError, PartnerDoesNotOwnMachineError } from '@/services/machineService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { serializeMachine } from '@/lib/vending/serialize';

/**
 * One machine's own detail read (§ CORE ENTITIES 1). Connectivity is
 * derived at read time from `lastSeenAt`, never stored — see
 * `lib/vending/connectivity.ts`'s own doc comment for why a computed
 * status can't drift out of sync with the timestamp it's computed
 * from the way a separately-written field could.
 *
 * Staff-only for now — `PartnerDoesNotOwnMachineError` is imported and
 * mapped to 403 already so a future partner-session caller (§ RBAC,
 * task pending) slots in without this route changing shape, but no
 * partner auth path exists yet to reach that branch.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  try {
    const machine = await machineService.findById(session.businessId, id);
    if (!machine) {
      return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
    }
    const connectivityStatus = deriveConnectivityStatus(machine.lastSeenAt);
    return Response.json({ machine: serializeMachine(id, machine, connectivityStatus) });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PartnerDoesNotOwnMachineError) {
      return forbiddenResponse();
    }
    throw error;
  }
}

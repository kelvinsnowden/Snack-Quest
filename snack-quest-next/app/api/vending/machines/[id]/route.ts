import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineService, MachineNotFoundError, PartnerDoesNotOwnMachineError, IllegalMachineStatusTransitionError } from '@/services/machineService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import { serializeMachine } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { MachineStatus } from '@/types';

const VALID_STATUSES: MachineStatus[] = ['provisioning', 'installing', 'testing', 'active', 'maintenance', 'offline', 'decommissioned'];

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

/**
 * § PART 9 — AUDIT LOG: "configuration updates". The only configuration
 * changes this route covers are status transitions and relocation —
 * both real, staff-initiated facts about the machine, each already
 * enforced by `machineService`'s own guarded transition/history
 * writes. A full re-provision (manufacturer/model/serial) is not a
 * "configuration update"; it doesn't exist as an operation at all.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { status, locationId, latitude, longitude, address, venueName, relocationReason } = (body ?? {}) as Record<string, unknown>;
  if (status === undefined && locationId === undefined) {
    return Response.json({ error: 'at least one of status or locationId is required' }, { status: 400 });
  }
  if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.includes(status as MachineStatus))) {
    return Response.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (locationId !== undefined && locationId !== null && typeof locationId !== 'string') {
    return Response.json({ error: 'locationId must be a string or null' }, { status: 400 });
  }

  try {
    const before = await machineService.findById(session.businessId, id);
    if (!before) {
      return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
    }

    if (status !== undefined) {
      await machineService.updateStatus(session.businessId, id, status as MachineStatus, session.uid);
    }
    if (locationId !== undefined) {
      await machineService.relocate(
        session.businessId,
        id,
        {
          locationId: locationId as string | null,
          latitude: typeof latitude === 'number' ? latitude : null,
          longitude: typeof longitude === 'number' ? longitude : null,
          address: typeof address === 'string' ? address : null,
          venueName: typeof venueName === 'string' ? venueName : null,
        },
        session.uid,
        typeof relocationReason === 'string' ? relocationReason : null,
      );
    }

    const after = await machineService.findById(session.businessId, id);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'update_machine_configuration',
      entityType: 'machine',
      entityId: id,
      before: { status: before.status, locationId: before.locationId },
      after: after ? { status: after.status, locationId: after.locationId } : null,
      machineId: id,
    });
    const connectivityStatus = deriveConnectivityStatus(after!.lastSeenAt);
    return Response.json({ machine: serializeMachine(id, after!, connectivityStatus) });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalMachineStatusTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

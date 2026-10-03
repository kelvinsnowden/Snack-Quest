import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasAnyPermission, hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { machineEconomicProfileService, EconomicProfileValidationError } from '@/services/machineEconomicProfileService';
import type { MachineOwnershipType } from '@/types';

/**
 * A machine's economic profile (§ MACHINE ECONOMIC PROFILE): who owns it,
 * on what terms, who owns its stock and how it settles. Read with
 * `owners.view` or `finance.machine_pnl.view`; the ownership type is set
 * with `machines.economics.manage` (the owner's terms are set on their
 * agreement).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasAnyPermission(session, ['owners.view', 'finance.machine_pnl.view'])) return forbiddenForPermission('owners.view');
  const { id } = await params;
  try {
    return Response.json({ profile: await machineEconomicProfileService.resolve(session.businessId, id) });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.economics.manage')) return forbiddenForPermission('machines.economics.manage');
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.ownershipType !== 'string') return Response.json({ error: '"ownershipType" is required.' }, { status: 400 });
  try {
    const result = await machineEconomicProfileService.setOwnershipType(session.businessId, id, body.ownershipType as MachineOwnershipType, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'machine.set_ownership_type',
      entityType: 'machine',
      entityId: id,
      before: { ownershipType: result.before },
      after: { ownershipType: result.after },
      machineId: id,
    });
    return Response.json({ profile: await machineEconomicProfileService.resolve(session.businessId, id) });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof EconomicProfileValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

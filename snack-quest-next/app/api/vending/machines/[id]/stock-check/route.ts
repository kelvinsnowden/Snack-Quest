import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineRepository } from '@/repositories/machineRepository';
import { machineInventoryMovementService, LedgerAlignmentRefusedError, SlotNotFoundError } from '@/services/machineInventoryMovementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Stock ledger check for one machine. `GET` (machines.view) compares
 * every slot's count with the sum of its stock movements. `POST`
 * (machine_inventory.adjust) sets one slot's count to what its ledger
 * says, with a reason; audited. Neither touches the ledger.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.view')) return forbiddenForPermission('machines.view');
  const { id } = await params;
  if (!(await machineRepository.findById(session.businessId, id))) return Response.json({ error: 'Machine not found' }, { status: 404 });
  const slots = await machineInventoryMovementService.reconcileMachine(session.businessId, id);
  return Response.json({ slots, mismatches: slots.filter((slot) => !slot.matches).length });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machine_inventory.adjust')) return forbiddenForPermission('machine_inventory.adjust');
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { slotCode, reason } = (body ?? {}) as Record<string, unknown>;
  if (typeof slotCode !== 'string' || !slotCode) return Response.json({ error: 'slotCode is required' }, { status: 400 });
  if (typeof reason !== 'string' || !reason.trim()) return Response.json({ error: 'Say why the count is being corrected.' }, { status: 400 });

  try {
    const result = await machineInventoryMovementService.alignSlotToLedger({ businessId: session.businessId, machineId: id, slotCode, reason: reason.trim() });
    if (result.changed) {
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: 'align_slot_count_to_ledger',
        entityType: 'machineSlot',
        entityId: `${id}__${slotCode}`,
        before: { currentQuantity: result.before },
        after: { currentQuantity: result.after, reason: reason.trim() },
        machineId: id,
      });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof SlotNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof LedgerAlignmentRefusedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

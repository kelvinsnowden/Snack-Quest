import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSlotService } from '@/services/machineSlotService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeMachineSlot } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A machine's own slots (§ CORE ENTITIES 2). `GET` is the panel-layout
 * read a machine detail page needs; `PATCH` is the two mutations that
 * exist without a full slot reconfiguration — price and enable/disable
 * — both of which call through to the hardware adapter as well as
 * Firestore (`MachineSlotService.setPrice`/`setEnabled`), so a slot's
 * recorded price always matches what the machine will actually charge.
 * Reassigning a slot's product/capacity is `configureSlot`, not
 * exposed here yet — this route only covers the two adjustments an
 * operator makes routinely, not a full re-provision.
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
  const slots = await machineSlotService.listByMachine(session.businessId, id);
  return Response.json({ slots: slots.map(serializeMachineSlot) });
}

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

  const { slotCode, priceKes, enabled } = (body ?? {}) as Record<string, unknown>;
  if (typeof slotCode !== 'string' || !slotCode) {
    return Response.json({ error: 'slotCode is required' }, { status: 400 });
  }
  if (priceKes === undefined && enabled === undefined) {
    return Response.json({ error: 'at least one of priceKes or enabled is required' }, { status: 400 });
  }
  if (priceKes !== undefined && (typeof priceKes !== 'number' || !Number.isFinite(priceKes) || priceKes < 0)) {
    return Response.json({ error: 'priceKes must be a non-negative number' }, { status: 400 });
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return Response.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  try {
    const beforeSlots = await machineSlotService.listByMachine(session.businessId, id);
    const before = beforeSlots.find((slot) => slot.slotCode === slotCode);

    if (priceKes !== undefined) {
      await machineSlotService.setPrice(session.businessId, id, slotCode, priceKes);
    }
    if (enabled !== undefined) {
      await machineSlotService.setEnabled(session.businessId, id, slotCode, enabled);
    }
    const slots = await machineSlotService.listByMachine(session.businessId, id);
    const updated = slots.find((slot) => slot.slotCode === slotCode);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: priceKes !== undefined ? 'change_slot_price' : 'change_slot_enabled',
      entityType: 'machineSlot',
      entityId: `${id}__${slotCode}`,
      before: before ? (serializeMachineSlot(before) as unknown as Record<string, unknown>) : null,
      after: updated ? (serializeMachineSlot(updated) as unknown as Record<string, unknown>) : null,
      machineId: id,
    });
    return Response.json({ slot: updated ? serializeMachineSlot(updated) : null });
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'could not update slot' }, { status: 400 });
  }
}

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSlotService, SlotChangeRefusedError } from '@/services/machineSlotService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Copies another machine's slot layout onto this one
 * (`machines.slots.configure`; copying prices also needs
 * `pricing.manage`). Stock is never copied, and the copy is refused
 * whole if any slot here would change product while it still holds stock.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.slots.configure')) return forbiddenForPermission('machines.slots.configure');
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.fromMachineId !== 'string' || !body.fromMachineId) return Response.json({ error: 'fromMachineId is required' }, { status: 400 });
  const includePrices = body.includePrices === true;
  if (includePrices && !hasPermission(session, 'pricing.manage')) return forbiddenForPermission('pricing.manage');

  try {
    const { copied } = await machineSlotService.copyLayout(session.businessId, body.fromMachineId, id, { includePrices, actor: session.uid });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'copy_slot_layout',
      entityType: 'machine',
      entityId: id,
      after: { fromMachineId: body.fromMachineId, includePrices, slots: copied },
      machineId: id,
    });
    return Response.json({ copied });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof SlotChangeRefusedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

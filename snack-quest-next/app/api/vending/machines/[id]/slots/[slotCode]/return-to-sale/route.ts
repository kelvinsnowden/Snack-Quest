import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSlotService, SlotChangeRefusedError } from '@/services/machineSlotService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * "Return to sale" for a slot that paused itself after a jam or an
 * unknown vend (`machines.slots.configure`). Someone has to say what
 * they found; that note goes in the audit log with the quarantine it
 * cleared.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; slotCode: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.slots.configure')) return forbiddenForPermission('machines.slots.configure');
  const { id, slotCode } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (!note) return Response.json({ error: 'Say what you found — e.g. "cleared a stuck bag, test vend OK".' }, { status: 400 });

  try {
    const cleared = await machineSlotService.releaseQuarantine(session.businessId, id, slotCode);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'return_slot_to_sale',
      entityType: 'machineSlot',
      entityId: `${id}__${slotCode}`,
      before: { quarantine: { reason: cleared.reason, transactionId: cleared.transactionId } },
      after: { enabled: true, note },
      machineId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SlotChangeRefusedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

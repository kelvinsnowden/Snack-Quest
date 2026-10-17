import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { CoolingValidationError } from '@/lib/vending/cooling';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { machineCoolingService } from '@/services/machineCoolingService';

/**
 * `PUT /api/vending/machines/{id}/cooling` `{ enabled, minCelsius, maxCelsius, alertAfterMinutes }`
 * — a machine's cooling target (§ refrigeration). Always used for
 * temperature alerts; also sent to the machine when it supports
 * `remote_cooling`, which is why it needs `machines.commands.issue`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.commands.issue')) return forbiddenForPermission('machines.commands.issue');

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as unknown;
  try {
    const result = await machineCoolingService.save(session.businessId, id, body, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'machine.set_cooling',
      entityType: 'machine',
      entityId: id,
      before: { cooling: result.before },
      after: { cooling: result.after, sent: result.sent },
      machineId: id,
    });
    return Response.json({ cooling: result.after, sent: result.sent });
  } catch (error) {
    if (error instanceof CoolingValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof MachineNotFoundError) return Response.json({ error: 'Machine not found.' }, { status: 404 });
    throw error;
  }
}

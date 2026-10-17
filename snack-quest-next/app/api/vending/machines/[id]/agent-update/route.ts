import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { CommandNotSupportedError } from '@/services/machineCommandService';
import { AgentReleaseUnavailableError, NotAnAgentMachineError, machineAgentUpdateService } from '@/services/machineAgentUpdateService';

/** `POST /api/vending/machines/{id}/agent-update` — sends the machine this deployment's Machine Agent release. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.commands.issue')) return forbiddenForPermission('machines.commands.issue');

  const { id } = await params;
  try {
    const result = await machineAgentUpdateService.update(session.businessId, id, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'machine.update_agent',
      entityType: 'machine',
      entityId: id,
      before: { release: result.from },
      after: { release: result.to, commandRef: result.commandRef },
      machineId: id,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof NotAnAgentMachineError || error instanceof CommandNotSupportedError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof AgentReleaseUnavailableError) return Response.json({ error: error.message }, { status: 503 });
    if (error instanceof MachineNotFoundError) return Response.json({ error: 'Machine not found.' }, { status: 404 });
    throw error;
  }
}

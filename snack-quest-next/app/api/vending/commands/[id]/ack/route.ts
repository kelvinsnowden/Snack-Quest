import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineCommandService, CommandExpiredError } from '@/services/machineCommandService';
import { MachineCommandNotFoundError } from '@/repositories/machineCommandRepository';
import { serializeMachineCommand } from '@/lib/vending/serialize';

/**
 * A device confirming receipt of one of its own pending commands
 * (§ types/machineCommand.ts) — the step before it actually executes
 * anything. A gateway that acknowledges a command it then fails to
 * execute is still expected to call `.../complete` with
 * `success: false`; acknowledging is not itself proof of anything
 * beyond "I have seen this."
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  const { id } = await params;

  try {
    const command = await machineCommandService.acknowledge(auth.businessId, id, auth.machineId);
    return Response.json({ command: serializeMachineCommand(id, command) });
  } catch (error) {
    if (error instanceof MachineCommandNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof CommandExpiredError) {
      return Response.json({ error: error.message }, { status: 410 });
    }
    throw error;
  }
}

import { authenticateDevice } from '@/lib/vending/deviceAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { machineCommandService } from '@/services/machineCommandService';
import { serializeMachineCommand } from '@/lib/vending/serialize';

/**
 * A machine's own pending commands (§ types/machineCommand.ts) — the
 * poll a real gateway would run on a schedule (a heartbeat interval,
 * typically), and the only way a command is ever delivered in Phase 1
 * absent a real-time transport. Scoped to the authenticated machine —
 * a device can only ever see its own commands, never enumerate
 * another's.
 */
export async function GET(request: Request): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const auth = await authenticateDevice(request, businessId);
  if (!auth.ok) {
    return Response.json({ error: auth.reason }, { status: 401 });
  }

  const commands = await machineCommandService.listPendingForMachine(auth.businessId, auth.machineId);
  return Response.json({ commands: commands.map(({ id, data }) => serializeMachineCommand(id, data)) });
}

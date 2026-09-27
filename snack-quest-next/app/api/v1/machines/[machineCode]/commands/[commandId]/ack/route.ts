import { handleMachineRequest, v1Ok } from '@/lib/vending/v1/machineApi';
import { machineApiService } from '@/services/machineApiService';

/**
 * `POST /api/v1/machines/{machineCode}/commands/{commandId}/ack` — the
 * machine confirms it has the command, before executing it (Machine API
 * v1 §6.2). An expired command is refused with 409 and must not be
 * executed. Re-acknowledging is a no-op.
 */
export async function POST(request: Request, { params }: { params: Promise<{ machineCode: string; commandId: string }> }): Promise<Response> {
  const { machineCode, commandId } = await params;
  return handleMachineRequest(request, machineCode, 'command_ack', async (context) => v1Ok(context, await machineApiService.acknowledgeCommand(context, commandId)));
}

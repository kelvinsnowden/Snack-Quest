import { handleMachineRequest, v1Ok } from '@/lib/vending/v1/machineApi';
import { machineApiService } from '@/services/machineApiService';

/** `GET /api/v1/machines/{machineCode}/commands` — everything this machine should act on now: queued dispenses, then maintenance commands (Machine API v1 §6.1). */
export async function GET(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, 'command_poll', async (context) => v1Ok(context, await machineApiService.listCommands(context)));
}

import { handleMachineRequest, v1Ok } from '@/lib/vending/v1/machineApi';
import { machineApiService } from '@/services/machineApiService';

/** `GET /api/v1/machines/{machineCode}` — the machine as Snack Quest knows it: state, capabilities, slot map, recommended intervals (Machine API v1 §5.2). */
export async function GET(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, 'describe', async (context) =>
    v1Ok(context, await machineApiService.describe(context.businessId, context.machine, context.integration)),
  );
}

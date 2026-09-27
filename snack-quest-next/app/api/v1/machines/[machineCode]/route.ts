import { handleMachineRequest, v1Json } from '@/lib/vending/v1/machineApi';
import { machineApiService } from '@/services/machineApiService';

/** `GET /api/v1/machines/{machineCode}` — the machine as Snack Quest knows it: state, capabilities, slot map, recommended intervals (Machine API v1 §5.2). */
export async function GET(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, async ({ businessId, machine, integration }) =>
    v1Json(await machineApiService.describe(businessId, machine, integration)),
  );
}

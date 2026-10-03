import { handleMachineRequest, parseBody, v1Ok } from '@/lib/vending/v1/machineApi';
import { inventorySchema } from '@/lib/vending/v1/schemas';
import { machineApiService } from '@/services/machineApiService';

/**
 * `POST /api/v1/machines/{machineCode}/inventory` — the machine's own
 * per-slot counts (Machine API v1 §5.5). Compared against Snack
 * Quest's inventory ledger and reported back; never overwrites it.
 * Idempotent per `reportId`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, 'inventory', async (context) =>
    v1Ok(context, await machineApiService.inventory(context, parseBody(inventorySchema, context.body))),
  );
}

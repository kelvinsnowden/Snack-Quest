import { handleMachineRequest, parseBody, v1Ok } from '@/lib/vending/v1/machineApi';
import { statusSchema } from '@/lib/vending/v1/schemas';
import { machineApiService } from '@/services/machineApiService';

/** `POST /api/v1/machines/{machineCode}/status` — a full status snapshot: online, door, temperature, faults, payment device (Machine API v1 §5.4). Idempotent per `eventId`. */
export async function POST(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, 'status', async (context) =>
    v1Ok(context, await machineApiService.status(context, parseBody(statusSchema, context.body)), 202),
  );
}

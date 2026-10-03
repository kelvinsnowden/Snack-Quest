import { handleMachineRequest, parseBody, v1Ok } from '@/lib/vending/v1/machineApi';
import { heartbeatSchema } from '@/lib/vending/v1/schemas';
import { machineApiService } from '@/services/machineApiService';

/** `POST /api/v1/machines/{machineCode}/heartbeat` — proof of life (Machine API v1 §5.3). Idempotent per `eventId`. */
export async function POST(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, 'heartbeat', async (context) =>
    v1Ok(context, await machineApiService.heartbeat(context, parseBody(heartbeatSchema, context.body)), 202),
  );
}

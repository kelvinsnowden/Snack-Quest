import { handleMachineRequest, parseBody, v1Json } from '@/lib/vending/v1/machineApi';
import { eventsSchema } from '@/lib/vending/v1/schemas';
import { machineApiService } from '@/services/machineApiService';

/**
 * `POST /api/v1/machines/{machineCode}/events` — a batch of up to 100
 * machine events in Snack Quest's vocabulary (Machine API v1 §5.6).
 * Unrecognised types are kept as UNKNOWN_EVENT; dispense outcomes are
 * refused here and must use the command status endpoint.
 */
export async function POST(request: Request, { params }: { params: Promise<{ machineCode: string }> }): Promise<Response> {
  const { machineCode } = await params;
  return handleMachineRequest(request, machineCode, async (context) =>
    v1Json(await machineApiService.events(context, parseBody(eventsSchema, context.body)), 202),
  );
}

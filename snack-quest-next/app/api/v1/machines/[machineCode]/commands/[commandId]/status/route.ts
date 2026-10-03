import { handleMachineRequest, parseBody, v1Ok } from '@/lib/vending/v1/machineApi';
import { commandStatusSchema } from '@/lib/vending/v1/schemas';
import { machineApiService } from '@/services/machineApiService';

/**
 * `POST /api/v1/machines/{machineCode}/commands/{commandId}/status` —
 * what happened (Machine API v1 §6.3). For a dispense this is the
 * money-moving report: `dispensed` completes the sale, `failed` refunds
 * the customer, `unknown` goes to a human. Idempotent per `eventId`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ machineCode: string; commandId: string }> }): Promise<Response> {
  const { machineCode, commandId } = await params;
  return handleMachineRequest(request, machineCode, 'command_status', async (context) =>
    v1Ok(context, await machineApiService.reportCommandStatus(context, commandId, parseBody(commandStatusSchema, context.body))),
  );
}

import { ContractViolationError, handleIntegrationRequest, parseBody, v1Ok } from '@/lib/vending/v1/machineApi';
import { connectSchema } from '@/lib/vending/v1/schemas';
import { machineApiService, MachineNotProvisionedError } from '@/services/machineApiService';

/**
 * `POST /api/v1/machines/connect` — a manufacturer's integration
 * announcing one of its units (Machine API v1 §5.1). Resolves the
 * manufacturer's own machine id to the Snack Quest machine staff
 * pre-registered for it, records firmware/controller facts, and
 * returns the machine's Snack Quest code, slot map and capabilities.
 * Never creates a machine.
 */
export async function POST(request: Request): Promise<Response> {
  return handleIntegrationRequest(request, 'api', 'connect', async ({ businessId, credential, requestId, body }) => {
    try {
      const description = await machineApiService.connect(businessId, credential, parseBody(connectSchema, body), requestId);
      return v1Ok({ requestId }, description);
    } catch (error) {
      if (error instanceof MachineNotProvisionedError) {
        throw new ContractViolationError('machine_not_provisioned', error.message, 404);
      }
      throw error;
    }
  });
}

import { ContractViolationError, handleIntegrationRequest, v1Ok } from '@/lib/vending/v1/machineApi';
import { manufacturerWebhookService, WebhookRejectedError } from '@/services/manufacturerWebhookService';
import { manufacturerRepository } from '@/repositories/manufacturerRepository';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';

/**
 * `POST /api/v1/webhooks/manufacturers/{slug}` — signed manufacturer
 * webhook deliveries (Machine API v1 §8). Signed with a `webhook`-kind
 * credential using the same scheme as every other v1 request, so
 * signature, timestamp and nonce (replay) checks happen before the body
 * is looked at.
 *
 * Status codes are chosen for a sender's retry logic: 2xx means "stop
 * retrying" (including for a duplicate), 4xx means "retrying won't
 * help", and a 5xx means "retry" — the delivery is recorded as failed
 * and safely reprocessed on the next attempt.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  return handleIntegrationRequest(request, 'webhook', 'webhook', async ({ businessId, credential, body, requestId }) => {
    // Outcomes of authenticated deliveries feed the webhook-failure alert.
    try {
      const result = await manufacturerWebhookService.ingest(businessId, credential, slug, body);
      await manufacturerRepository.noteWebhookOutcome(credential.manufacturerId, 'accepted');
      return v1Ok({ requestId }, result, result.duplicate ? 200 : 202);
    } catch (error) {
      const code = error instanceof WebhookRejectedError ? error.code : error instanceof UnrecognisedHardwarePayloadError ? 'unrecognised_payload' : 'internal_error';
      await manufacturerRepository.noteWebhookOutcome(credential.manufacturerId, 'rejected', code);
      if (error instanceof WebhookRejectedError) {
        throw new ContractViolationError(error.code, error.message, error.status);
      }
      throw error;
    }
  });
}

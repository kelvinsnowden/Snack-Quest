import { withdrawalService } from '@/services/withdrawalService';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

/**
 * Daraja's Transaction Status Query QueueTimeOutURL (§ Daraja B2C
 * production readiness — stuck-withdrawal reconciliation) — called
 * instead of the ResultURL when Safaricom's own processing queue times
 * out before a result is available. Carries the same `Result` payload
 * shape as a real query failure, so it's handled by the exact same
 * path as `transaction-status-result` — same discipline as
 * `b2c-timeout`/`reversal-timeout` already use.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId: businessIdParam } = await params;
  const verification = await verifyDarajaWebhookRequest(businessIdParam, request);
  if (!verification.ok) {
    return verification.response;
  }
  // The route param may carry the webhook secret; this is the real tenant id.
  const businessId = verification.businessId;

  const payload = await request.json();
  await withdrawalService.handleTransactionStatusResult(businessId, payload);

  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

import { withdrawalService } from '@/services/withdrawalService';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

/**
 * Daraja's Transaction Status Query ResultURL (§ Daraja B2C production
 * readiness — stuck-withdrawal reconciliation). Same per-tenant URL
 * shape as the B2C/reversal result webhooks, one dedicated path
 * further since a status query is registered as its own ResultURL.
 * Idempotency and matching the result back to the withdrawal a
 * reconciliation sweep queried it for both happen in
 * `WithdrawalService.handleTransactionStatusResult()` — this route is
 * just the wire — real origin verification (§ Secure the Daraja and
 * Whatchimp webhook routes) happens in `verifyDarajaWebhookRequest`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId } = await params;
  const verification = await verifyDarajaWebhookRequest(businessId, request);
  if (!verification.ok) {
    return verification.response;
  }

  const payload = await request.json();
  await withdrawalService.handleTransactionStatusResult(businessId, payload);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

import { withdrawalService } from '@/services/withdrawalService';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

/**
 * Daraja's B2C ResultURL (§ Admin: Withdrawals — Daraja B2C). Same
 * per-tenant URL shape as the C2B STK callback
 * (`.../daraja/{businessId}`), one dedicated path further since B2C
 * and STK are registered as separate Safaricom credentials/URLs.
 * Idempotency, matching the result back to a withdrawal, and the
 * balance-refund-on-failure all happen in
 * `WithdrawalService.handleB2CResult()` — this route is just the wire —
 * real origin verification (§ Secure the Daraja and Whatchimp webhook
 * routes) happens in `verifyDarajaWebhookRequest`.
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
  await withdrawalService.handleB2CResult(businessId, payload);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

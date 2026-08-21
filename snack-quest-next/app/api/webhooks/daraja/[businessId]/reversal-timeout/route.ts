import { refundService } from '@/services/refundService';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

/**
 * Daraja's reversal QueueTimeOutURL (§ RefundService + Daraja reversal
 * support) — called instead of the ResultURL when Safaricom's own
 * processing queue times out before a result is available. Carries the
 * same `Result` payload shape as a real failure, so it's handled by the
 * exact same path as `reversal-result` — a timeout is a real "this
 * reversal did not complete" outcome, not a distinct case to
 * special-case (same discipline as `b2c-timeout`).
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
  await refundService.handleReversalResult(businessId, payload);

  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

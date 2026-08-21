import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

/**
 * Daraja's STK Push callback (PLATFORM_ARCHITECTURE_V2.md §7). The
 * business is part of the URL itself, not resolved from the payload —
 * Safaricom requires each shortcode/app to register its own specific
 * callback URL, so every tenant gets a distinct URL
 * (`.../daraja/{businessId}`) to hand Safaricom at Daraja app
 * registration time. Thin by design otherwise — idempotency,
 * verification, and amount matching all happen in
 * `paymentService.processCallback()`; the domain reaction (what
 * happens to the conversation) happens in
 * `conversationService.handlePaymentResult()`. This route is just the
 * wire — real origin verification (§ Secure the Daraja and Whatchimp
 * webhook routes) happens in `verifyDarajaWebhookRequest`.
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
  const result = await paymentService.processCallback(businessId, payload);
  await conversationService.handlePaymentResult(result);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

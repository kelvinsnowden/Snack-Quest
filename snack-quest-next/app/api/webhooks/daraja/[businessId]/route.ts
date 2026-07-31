import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';

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
 * wire.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId } = await params;
  const payload = await request.json();
  const result = await paymentService.processCallback(businessId, payload);
  await conversationService.handlePaymentResult(result);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

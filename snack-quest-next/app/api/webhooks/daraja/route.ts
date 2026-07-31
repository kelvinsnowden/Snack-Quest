import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';

/**
 * Daraja's STK Push callback (PLATFORM_ARCHITECTURE_V2.md §7). Thin by
 * design — idempotency, verification, and amount matching all happen
 * in `paymentService.processCallback()`; the domain reaction (what
 * happens to the conversation) happens in
 * `conversationService.handlePaymentResult()`. This route is just the
 * wire.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await request.json();
  const result = await paymentService.processCallback(payload);
  await conversationService.handlePaymentResult(result);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

import { refundService } from '@/services/refundService';

/**
 * Daraja's reversal ResultURL (§ RefundService + Daraja reversal
 * support). Same per-tenant URL shape as the B2C result webhook, one
 * dedicated path further since reversal and B2C are registered as
 * separate ResultURLs even though they share operator credentials.
 * Idempotency and matching the result back to a refund both happen in
 * `RefundService.handleReversalResult()` — this route is just the wire.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId } = await params;
  const payload = await request.json();
  await refundService.handleReversalResult(businessId, payload);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

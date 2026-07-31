import { withdrawalService } from '@/services/withdrawalService';

/**
 * Daraja's B2C ResultURL (§ Admin: Withdrawals — Daraja B2C). Same
 * per-tenant URL shape as the C2B STK callback
 * (`.../daraja/{businessId}`), one dedicated path further since B2C
 * and STK are registered as separate Safaricom credentials/URLs.
 * Idempotency, matching the result back to a withdrawal, and the
 * balance-refund-on-failure all happen in
 * `WithdrawalService.handleB2CResult()` — this route is just the wire.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId } = await params;
  const payload = await request.json();
  await withdrawalService.handleB2CResult(businessId, payload);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

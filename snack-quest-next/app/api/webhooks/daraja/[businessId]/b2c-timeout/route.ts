import { withdrawalService } from '@/services/withdrawalService';

/**
 * Daraja's B2C QueueTimeOutURL (§ Admin: Withdrawals — Daraja B2C) —
 * called instead of the ResultURL when Safaricom's own processing
 * queue times out before a result is available. Carries the same
 * `Result` payload shape as a real failure, so it's handled by the
 * exact same path as `b2c-result` — a timeout is a real "this payout
 * did not complete" outcome, not a distinct case to special-case.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId } = await params;
  const payload = await request.json();
  await withdrawalService.handleB2CResult(businessId, payload);

  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

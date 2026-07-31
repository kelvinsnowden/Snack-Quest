import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  withdrawalService,
  WithdrawalNotFoundError,
  InvalidWithdrawalTransitionError,
} from '@/services/withdrawalService';

/** Rejects a pending withdrawal and refunds the reserved balance (§ Admin: Withdrawals). Requires a reason — this is a real financial decision an owner will see. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ withdrawalId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { withdrawalId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { reason } = (body ?? {}) as { reason?: unknown };
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return Response.json({ error: '"reason" is required.' }, { status: 400 });
  }

  try {
    await withdrawalService.rejectWithdrawal(session.businessId, withdrawalId, session.uid, reason.trim());
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof WithdrawalNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidWithdrawalTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not reject withdrawal' },
      { status: 400 },
    );
  }
}

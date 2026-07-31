import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  withdrawalService,
  WithdrawalNotFoundError,
  InvalidWithdrawalTransitionError,
} from '@/services/withdrawalService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Approves a pending withdrawal and immediately triggers the real
 * Daraja B2C payout (§ Admin: Withdrawals). The response's `status`
 * reflects what actually happened: `'approved'` if Safaricom accepted
 * the request, `'failed'` if the B2C call itself was rejected — this
 * is not a fire-and-forget action, the admin needs to know which one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ withdrawalId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { withdrawalId } = await params;

  try {
    const status = await withdrawalService.approveWithdrawal(session.businessId, withdrawalId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'withdrawal.approve',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      after: { status },
    });
    return Response.json({ status });
  } catch (error) {
    if (error instanceof WithdrawalNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidWithdrawalTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not approve withdrawal' },
      { status: 400 },
    );
  }
}

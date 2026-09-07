import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  withdrawalService,
  WithdrawalNotFoundError,
  InvalidWithdrawalTransitionError,
} from '@/services/withdrawalService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Records a withdrawal the admin already paid from the M-Pesa app
 * (§ pay a withdrawal manually).
 *
 * Distinct from `resolve/`, which settles a withdrawal whose B2C
 * request is in flight and whose outcome is genuinely unknown. This
 * one never involves Daraja at all: the money was sent by hand, and
 * this is where that gets written down.
 *
 * Both the reference and the note are required. The reference is what
 * makes the record reconcilable against an M-Pesa statement, and
 * without it this endpoint would only let somebody assert that a
 * creator had been paid. `ADMIN_ONLY` for the same reason every other
 * withdrawal transition is: it moves money.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ withdrawalId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { withdrawalId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { reference, note } = (body ?? {}) as { reference?: unknown; note?: unknown };
  if (typeof reference !== 'string' || reference.trim().length === 0) {
    return Response.json(
      { error: '"reference" is required — the M-Pesa code from the transfer you sent.' },
      { status: 400 },
    );
  }
  if (typeof note !== 'string' || note.trim().length === 0) {
    return Response.json(
      { error: '"note" is required — say why this was paid by hand rather than through M-Pesa B2C.' },
      { status: 400 },
    );
  }

  try {
    await withdrawalService.payWithdrawalManually(
      session.businessId,
      withdrawalId,
      session.uid,
      session.displayName,
      reference.trim(),
      note.trim(),
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'withdrawal.pay_manually',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      after: { reference: reference.trim(), note: note.trim() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof WithdrawalNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    /*
     * The interesting failure, and the one worth a specific message: a
     * withdrawal that has left `pending` has either a live B2C request
     * against it or a refunded balance, and recording a manual payment
     * on top of that is how somebody gets paid twice.
     */
    if (error instanceof InvalidWithdrawalTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

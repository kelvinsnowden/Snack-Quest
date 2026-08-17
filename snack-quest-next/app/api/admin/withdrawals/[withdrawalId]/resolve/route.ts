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
 * A human's explicit, audited resolution of a withdrawal that
 * `WithdrawalService.reconcileStuckWithdrawals`/`handleTransactionStatusResult`
 * escalated as ambiguous (§ Daraja B2C production readiness) — never
 * automatic. An admin must have already checked Safaricom's own
 * merchant statement directly before calling this; `note` is required
 * so that check is on record.
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

  const { resolution, note } = (body ?? {}) as {
    resolution?: unknown;
    note?: unknown;
  };
  if (resolution !== 'confirmed_paid' && resolution !== 'confirmed_failed') {
    return Response.json(
      { error: '"resolution" must be "confirmed_paid" or "confirmed_failed".' },
      { status: 400 },
    );
  }
  if (typeof note !== 'string' || note.trim().length === 0) {
    return Response.json(
      {
        error:
          '"note" is required — record what you checked against the M-Pesa statement before resolving.',
      },
      { status: 400 },
    );
  }

  try {
    await withdrawalService.resolveAmbiguousWithdrawal(
      session.businessId,
      withdrawalId,
      session.uid,
      resolution,
      note.trim(),
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'withdrawal.resolve',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      after: { resolution, note: note.trim() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof WithdrawalNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidWithdrawalTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not resolve withdrawal',
      },
      { status: 400 },
    );
  }
}

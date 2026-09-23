import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import {
  withdrawalService,
  PartnerNotEligibleForWithdrawalError,
  InsufficientPartnerBalanceError,
  WithdrawalBelowMinimumError,
  WithdrawalAboveMaximumError,
} from '@/services/withdrawalService';

/**
 * A partner's own withdrawal history/requests (§ OWNER WITHDRAWAL,
 * docs/MACHINE_COMMERCE.md §7). `POST` is staff-initiated — there is no
 * partner login yet (§8), so a staff member requests the withdrawal on
 * the partner's behalf; everything from there on (`approve`/`reject`/
 * `pay-manually`, all under `/api/admin/withdrawals/{id}/*`) is the
 * exact same engine a creator withdrawal already goes through.
 * `ADMIN_ONLY` for the write — it reserves real money.
 */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { partnerId } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const { withdrawals, nextCursor } = await withdrawalService.listWithdrawalsForOwner(session.businessId, partnerId, { cursor });
  return Response.json({
    withdrawals: withdrawals.map(({ id, data }) => ({
      id,
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      amountKes: data.amountKes,
      status: data.status,
      createdAt: data.createdAt.toDate().toISOString(),
      paidAt: data.paidAt ? data.paidAt.toDate().toISOString() : null,
    })),
    nextCursor,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { partnerId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { amountKes, phoneNumber } = (body ?? {}) as Record<string, unknown>;
  if (typeof amountKes !== 'number' || !Number.isFinite(amountKes) || amountKes <= 0) {
    return Response.json({ error: 'amountKes must be a positive number' }, { status: 400 });
  }
  if (typeof phoneNumber !== 'string' || !phoneNumber) {
    return Response.json({ error: 'phoneNumber is required' }, { status: 400 });
  }

  try {
    const withdrawalId = await withdrawalService.requestWithdrawal({
      businessId: session.businessId,
      ownerId: partnerId,
      ownerType: 'partner',
      amountKes,
      phoneNumber,
    });
    return Response.json({ withdrawalId }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerNotEligibleForWithdrawalError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InsufficientPartnerBalanceError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof WithdrawalBelowMinimumError || error instanceof WithdrawalAboveMaximumError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

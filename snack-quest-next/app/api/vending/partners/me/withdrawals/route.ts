import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import {
  withdrawalService,
  PartnerNotEligibleForWithdrawalError,
  InsufficientPartnerBalanceError,
  WithdrawalBelowMinimumError,
  WithdrawalAboveMaximumError,
} from '@/services/withdrawalService';
import { normalizeKenyanPhone, InvalidPhoneNumberError } from '@/lib/checkout/phone';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A partner's own withdrawal history and requests (§ WITHDRAWAL) —
 * `ownerId` is always `session.partnerId`, never read from the
 * request body, so a partner can never request a withdrawal against
 * another partner's balance by passing a different id
 * (§ FAILURE SCENARIO: "client-side amount manipulation" covers the
 * amount; this is the same discipline applied to the identity).
 * Overdraft, duplicate withdrawal, and the race between two concurrent
 * requests are all already prevented inside
 * `withdrawalService.requestWithdrawal`'s own Firestore transaction
 * (`partnerRepository.reserveBalanceInTransaction`) — nothing new to
 * add at this layer beyond scoping who is allowed to call it.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const { withdrawals, nextCursor } = await withdrawalService.listWithdrawalsForOwner(session.businessId, session.partnerId, { cursor });
  return Response.json({
    withdrawals: withdrawals.map(({ id, data }) => ({
      id,
      amountKes: data.amountKes,
      status: data.status,
      createdAt: data.createdAt.toDate().toISOString(),
      paidAt: data.paidAt ? data.paidAt.toDate().toISOString() : null,
    })),
    nextCursor,
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

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

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeKenyanPhone(phoneNumber);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const withdrawalId = await withdrawalService.requestWithdrawal({
      businessId: session.businessId,
      ownerId: session.partnerId,
      ownerType: 'partner',
      amountKes,
      phoneNumber: normalizedPhone,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.partnerId,
      action: 'request_withdrawal',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      after: { ownerId: session.partnerId, ownerType: 'partner', amountKes },
      source: 'owner_portal',
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

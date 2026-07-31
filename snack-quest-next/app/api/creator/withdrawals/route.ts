import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import {
  withdrawalService,
  InsufficientCreatorBalanceError,
  CreatorNotEligibleForWithdrawalError,
} from '@/services/withdrawalService';

const PHONE_PATTERN = /^254\d{9}$/;

/** A creator requesting a withdrawal from their own available balance (§ Creator Portal withdrawals) — always scoped to the signed-in creator, never a client-supplied owner. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyCreatorSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { amountKes, phoneNumber } = (body ?? {}) as { amountKes?: unknown; phoneNumber?: unknown };
  if (typeof amountKes !== 'number' || !Number.isFinite(amountKes) || amountKes <= 0) {
    return Response.json({ error: '"amountKes" must be a positive number.' }, { status: 400 });
  }
  if (typeof phoneNumber !== 'string' || !PHONE_PATTERN.test(phoneNumber)) {
    return Response.json(
      { error: '"phoneNumber" must be E.164 without the leading "+", e.g. "254712345678".' },
      { status: 400 },
    );
  }

  try {
    const withdrawalId = await withdrawalService.requestWithdrawal({
      businessId: session.businessId,
      ownerId: session.uid,
      ownerType: 'creator',
      amountKes,
      phoneNumber,
    });
    return Response.json({ withdrawalId }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientCreatorBalanceError) {
      return Response.json({ error: 'You don’t have enough available balance for that amount.' }, { status: 400 });
    }
    if (error instanceof CreatorNotEligibleForWithdrawalError) {
      return Response.json({ error: 'Your account is not eligible to request a withdrawal.' }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not request withdrawal' },
      { status: 400 },
    );
  }
}

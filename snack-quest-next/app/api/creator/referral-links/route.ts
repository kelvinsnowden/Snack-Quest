import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import { referralService, DuplicateReferralCodeError, CreatorNotEligibleError } from '@/services/referralService';

interface CreateReferralLinkBody {
  code?: unknown;
  discountKes?: unknown;
  commissionKes?: unknown;
}

function validate(body: CreateReferralLinkBody): { error: string } | null {
  if (typeof body.code !== 'string' || body.code.trim().length === 0) {
    return { error: '"code" is required.' };
  }
  if (typeof body.discountKes !== 'number' || !Number.isFinite(body.discountKes) || body.discountKes < 0) {
    return { error: '"discountKes" must be a non-negative number.' };
  }
  if (typeof body.commissionKes !== 'number' || !Number.isFinite(body.commissionKes) || body.commissionKes < 0) {
    return { error: '"commissionKes" must be a non-negative number.' };
  }
  return null;
}

/** A creator creating their own referral link (§ Creator Portal referral links) — same `ReferralService.createLink()` the admin route uses, always scoped to the signed-in creator's own uid, never a client-supplied one. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyCreatorSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CreateReferralLinkBody;
  try {
    body = (await request.json()) as CreateReferralLinkBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return Response.json(validationError, { status: 400 });
  }

  try {
    const linkId = await referralService.createLink(
      {
        businessId: session.businessId,
        ownerId: session.uid,
        code: body.code as string,
        discountKes: body.discountKes as number,
        commissionKes: body.commissionKes as number,
        isActive: true,
      },
      session.uid,
    );
    return Response.json({ linkId }, { status: 201 });
  } catch (error) {
    if (error instanceof CreatorNotEligibleError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateReferralCodeError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not create referral link' },
      { status: 400 },
    );
  }
}

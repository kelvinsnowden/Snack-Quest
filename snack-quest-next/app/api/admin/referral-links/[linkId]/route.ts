import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  referralService,
  ReferralLinkNotFoundError,
  DuplicateReferralCodeError,
} from '@/services/referralService';
import type { ReferralLinkInput } from '@/repositories/referralLinkRepository';

interface UpdateReferralLinkBody {
  code?: unknown;
  discountKes?: unknown;
  commissionKes?: unknown;
  isActive?: unknown;
}

function buildPatch(body: UpdateReferralLinkBody): { patch: Partial<ReferralLinkInput> } | { error: string } {
  const patch: Partial<ReferralLinkInput> = {};

  if (body.code !== undefined) {
    if (typeof body.code !== 'string' || body.code.trim().length === 0) {
      return { error: '"code" must be a non-empty string when provided.' };
    }
    patch.code = body.code;
  }
  if (body.discountKes !== undefined) {
    if (typeof body.discountKes !== 'number' || !Number.isFinite(body.discountKes) || body.discountKes < 0) {
      return { error: '"discountKes" must be a non-negative number when provided.' };
    }
    patch.discountKes = body.discountKes;
  }
  if (body.commissionKes !== undefined) {
    if (typeof body.commissionKes !== 'number' || !Number.isFinite(body.commissionKes) || body.commissionKes < 0) {
      return { error: '"commissionKes" must be a non-negative number when provided.' };
    }
    patch.commissionKes = body.commissionKes;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return { error: '"isActive" must be a boolean when provided.' };
    }
    patch.isActive = body.isActive;
  }

  return { patch };
}

/** Updates a referral link, or a one-field `{ isActive: false }` patch to retire it (§ Admin: Referrals). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { linkId } = await params;

  let body: UpdateReferralLinkBody;
  try {
    body = (await request.json()) as UpdateReferralLinkBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const result = buildPatch(body);
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  try {
    await referralService.updateLink(session.businessId, linkId, result.patch, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReferralLinkNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DuplicateReferralCodeError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update referral link' },
      { status: 400 },
    );
  }
}

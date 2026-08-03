import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  referralService,
  ReferralLinkNotFoundError,
} from '@/services/referralService';

/**
 * Pauses or resumes a creator's referral link (§ referral system
 * overhaul) — the only mutation left here. A creator's one permanent
 * link is auto-generated at registration with a fixed discount and a
 * commission locked in by their real registration order; there is no
 * code, discount, or commission left for an admin to edit, only
 * whether the link is currently active.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { linkId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { isActive } = (body ?? {}) as { isActive?: unknown };
  if (typeof isActive !== 'boolean') {
    return Response.json(
      { error: '"isActive" must be a boolean.' },
      { status: 400 },
    );
  }

  try {
    await referralService.setActive(
      session.businessId,
      linkId,
      isActive,
      session.uid,
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReferralLinkNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not update referral link',
      },
      { status: 400 },
    );
  }
}

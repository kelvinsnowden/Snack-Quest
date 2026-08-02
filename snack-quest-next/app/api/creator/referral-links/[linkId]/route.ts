import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import { referralService, ReferralLinkNotFoundError } from '@/services/referralService';

/** A creator activating/deactivating their own referral link (§ Creator Portal referral links). */
export async function PATCH(request: Request, { params }: { params: Promise<{ linkId: string }> }): Promise<Response> {
  const session = await verifyCreatorSessionFromRequest(request);
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
    return Response.json({ error: '"isActive" must be a boolean.' }, { status: 400 });
  }

  try {
    await referralService.setActiveForOwner(session.businessId, session.uid, linkId, isActive, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReferralLinkNotFoundError) {
      return Response.json({ error: 'Referral link not found.' }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update referral link' },
      { status: 400 },
    );
  }
}

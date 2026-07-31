import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { creatorAdminService, CreatorNotFoundError, InvalidCreatorTransitionError } from '@/services/creatorAdminService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { CreatorStatus } from '@/types';

const VALID_STATUSES: CreatorStatus[] = ['pending', 'active', 'suspended'];

/** Approve/reject/suspend/reinstate a creator (§ Admin: Creators) — the one write path, enforcing `VALID_CREATOR_TRANSITIONS` server-side. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { uid } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { status } = (body ?? {}) as { status?: unknown };
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as CreatorStatus)) {
    return Response.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    await creatorAdminService.updateStatus(session.businessId, uid, status as CreatorStatus, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'creator.status_update',
      entityType: 'creatorProfile',
      entityId: uid,
      after: { status },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CreatorNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidCreatorTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update creator' },
      { status: 400 },
    );
  }
}

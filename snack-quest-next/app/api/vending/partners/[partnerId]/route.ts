import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import {
  partnerService,
  PartnerValidationError,
} from '@/services/partnerService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const FIELDS = [
  'name',
  'contactEmail',
  'contactPhone',
  'note',
  'status',
] as const;

/**
 * Edit a machine owner's details, or suspend / reactivate them
 * (`owners.manage`). Suspending ends their portal access on their next
 * request; it leaves their machines, agreements and money untouched.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ partnerId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage'))
    return forbiddenForPermission('owners.manage');
  const { partnerId } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const changes: Record<string, string | null> = {};
  for (const field of FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string')
      return Response.json(
        { error: `${field} must be a string` },
        { status: 400 },
      );
    if (value === null && (field === 'name' || field === 'status'))
      return Response.json(
        { error: `${field} can’t be empty` },
        { status: 400 },
      );
    changes[field] = value;
  }

  try {
    const { before, after } = await partnerService.update(
      session.businessId,
      partnerId,
      changes,
      session.uid,
    );
    const pick = (partner: typeof before) =>
      Object.fromEntries(
        Object.keys(changes).map((key) => [
          key,
          partner[key as keyof typeof partner] ?? null,
        ]),
      );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action:
        changes.status && changes.status !== before.status
          ? changes.status === 'suspended'
            ? 'suspend_machine_owner'
            : 'reactivate_machine_owner'
          : 'update_machine_owner',
      entityType: 'partner',
      entityId: partnerId,
      before: pick(before),
      after: pick(after),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PartnerValidationError)
      return Response.json(
        { error: error.message },
        { status: error.message === 'Owner not found.' ? 404 : 400 },
      );
    throw error;
  }
}

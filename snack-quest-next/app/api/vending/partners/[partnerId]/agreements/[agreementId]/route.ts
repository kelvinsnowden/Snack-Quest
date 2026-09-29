import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import {
  partnerService,
  PartnerValidationError,
} from '@/services/partnerService';
import {
  AgreementConflictError,
  AgreementNotFoundError,
} from '@/repositories/partnerMachineAgreementRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Start a draft agreement or end one (`owners.manage`). Ended agreements stay on record; they're never deleted. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ partnerId: string; agreementId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage'))
    return forbiddenForPermission('owners.manage');
  const { partnerId, agreementId } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (body.status !== 'active' && body.status !== 'terminated')
    return Response.json(
      { error: 'status must be active or terminated' },
      { status: 400 },
    );

  try {
    const after = await partnerService.transitionAgreement(
      session.businessId,
      partnerId,
      agreementId,
      body.status,
      session.uid,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action:
        body.status === 'active'
          ? 'activate_owner_agreement'
          : 'end_owner_agreement',
      entityType: 'partnerMachineAgreement',
      entityId: agreementId,
      after: { status: after.status },
      machineId: after.machineId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (
      error instanceof PartnerValidationError ||
      error instanceof AgreementNotFoundError
    )
      return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof AgreementConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

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
import {
  parseCommercialTerms,
  EconomicProfileValidationError,
} from '@/services/machineEconomicProfileService';

/**
 * Start a draft agreement or end one (`{ status }`, `owners.manage`), or
 * change its commercial terms (`{ terms }`, `machines.economics.manage`).
 * Ended agreements stay on record; they're never deleted or edited.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ partnerId: string; agreementId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { partnerId, agreementId } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (body.terms !== undefined) {
    if (!hasPermission(session, 'machines.economics.manage'))
      return forbiddenForPermission('machines.economics.manage');
    try {
      const terms = parseCommercialTerms(body.terms);
      if (Object.keys(terms).length === 0)
        return Response.json({ error: 'Nothing to change in "terms".' }, { status: 400 });
      const result = await partnerService.setAgreementTerms(
        session.businessId,
        partnerId,
        agreementId,
        terms,
        session.uid,
      );
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: 'change_owner_agreement_terms',
        entityType: 'partnerMachineAgreement',
        entityId: agreementId,
        before: { terms: result.before },
        after: { terms: result.after },
        machineId: result.machineId,
      });
      return Response.json({ ok: true, terms: result.after });
    } catch (error) {
      if (error instanceof EconomicProfileValidationError)
        return Response.json({ error: error.message }, { status: 400 });
      if (error instanceof PartnerValidationError)
        return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }
  if (!hasPermission(session, 'owners.manage'))
    return forbiddenForPermission('owners.manage');
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

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import {
  partnerService,
  PartnerValidationError,
} from '@/services/partnerService';
import { AgreementConflictError } from '@/repositories/partnerMachineAgreementRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const text = (value: unknown) => (typeof value === 'string' ? value : null);

/**
 * An owner's machine agreements: list (`owners.view`) and record a new
 * one (`owners.manage`). Terms are only what staff enter — a blank
 * revenue share stays blank; nothing is defaulted.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ partnerId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.view'))
    return forbiddenForPermission('owners.view');
  const { partnerId } = await params;
  const rows = await partnerService.listAgreements(
    session.businessId,
    partnerId,
  );
  return Response.json({
    agreements: rows.map(({ id, data }) => ({
      id,
      machineId: data.machineId,
      status: data.status,
      revenueSharePartnerPct: data.revenueSharePartnerPct,
      operatingCostNote: data.operatingCostNote,
      effectiveFrom: data.effectiveFrom
        ? data.effectiveFrom.toDate().toISOString()
        : null,
      effectiveTo: data.effectiveTo
        ? data.effectiveTo.toDate().toISOString()
        : null,
      documentRef: data.documentRef,
      note: data.note,
    })),
  });
}

export async function POST(
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
  if (typeof body.machineId !== 'string' || !body.machineId)
    return Response.json({ error: 'machineId is required' }, { status: 400 });
  const status = body.status ?? 'draft';
  if (status !== 'draft' && status !== 'active')
    return Response.json(
      { error: 'status must be draft or active' },
      { status: 400 },
    );
  const pct = body.revenueSharePartnerPct;
  if (pct !== undefined && pct !== null && typeof pct !== 'number')
    return Response.json(
      { error: 'revenueSharePartnerPct must be a number or null' },
      { status: 400 },
    );
  let effectiveFrom: Date | null = null;
  if (body.effectiveFrom !== undefined && body.effectiveFrom !== null) {
    effectiveFrom =
      typeof body.effectiveFrom === 'string'
        ? new Date(body.effectiveFrom)
        : null;
    if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime()))
      return Response.json(
        { error: 'effectiveFrom must be an ISO date' },
        { status: 400 },
      );
  }

  try {
    const agreementId = await partnerService.createAgreement({
      businessId: session.businessId,
      partnerId,
      machineId: body.machineId,
      status,
      revenueSharePartnerPct: (pct as number | null | undefined) ?? null,
      operatingCostNote: text(body.operatingCostNote),
      effectiveFrom,
      documentRef: text(body.documentRef),
      note: text(body.note),
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'create_owner_agreement',
      entityType: 'partnerMachineAgreement',
      entityId: agreementId,
      after: {
        partnerId,
        machineId: body.machineId,
        status,
        revenueSharePartnerPct: pct ?? null,
      },
      machineId: body.machineId,
    });
    return Response.json({ agreementId }, { status: 201 });
  } catch (error) {
    if (error instanceof PartnerValidationError)
      return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AgreementConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

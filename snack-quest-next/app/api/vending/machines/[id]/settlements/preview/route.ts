import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSettlementService, OwnershipChangedDuringPeriodError } from '@/services/machineSettlementService';
import { machineRepository } from '@/repositories/machineRepository';

/**
 * What a settlement for this machine and period would hold, without
 * saving it (`owner_finance.settlements.manage`). The same numbers
 * `POST .../settlements` would store — shown so someone can check them
 * before committing to a draft.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owner_finance.settlements.manage')) return forbiddenForPermission('owner_finance.settlements.manage');
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const start = typeof body.periodStart === 'string' ? new Date(body.periodStart) : null;
  const end = typeof body.periodEnd === 'string' ? new Date(body.periodEnd) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Response.json({ error: 'periodStart and periodEnd must be ISO date strings' }, { status: 400 });
  if (end <= start) return Response.json({ error: 'periodEnd must be after periodStart' }, { status: 400 });
  if (end.getTime() > Date.now()) return Response.json({ error: 'The period can’t end in the future — its sales aren’t all in yet.' }, { status: 400 });

  const machine = await machineRepository.findById(session.businessId, id);
  if (!machine) return Response.json({ error: `Machine ${id} not found` }, { status: 404 });
  if (!machine.ownerPartnerId) return Response.json({ error: 'This machine belongs to Snack Quest; there is no owner to settle with.' }, { status: 409 });

  try {
    const { draft, overlapsSettlementId } = await machineSettlementService.previewDraft({ businessId: session.businessId, machineId: id, partnerId: machine.ownerPartnerId, periodStart: start, periodEnd: end });
    return Response.json({
      preview: {
        grossSalesKes: draft.grossSalesKes,
        refundsKes: draft.refundsKes,
        cogsKes: draft.cogsKes,
        unpricedSaleCount: draft.unpricedSaleCount,
        subscriptionChargedKes: draft.subscriptionChargedKes,
        distributableOwnerKes: draft.distributableOwnerKes,
        failedVendRefundsKes: draft.failedVendRefundsKes ?? 0,
        outcomeConflictCount: draft.outcomeConflictCount ?? 0,
        agreementId: draft.agreementId,
        partnerShareKes: draft.partnerShareKes,
      },
      overlapsSettlementId,
    });
  } catch (error) {
    if (error instanceof OwnershipChangedDuringPeriodError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

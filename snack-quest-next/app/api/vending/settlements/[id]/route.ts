import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSettlementService, MachineSettlementNotFoundError, SettlementChangeRefusedError } from '@/services/machineSettlementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A draft settlement's corrections (`owner_finance.settlements.manage`):
 * `PATCH` sets an adjustment with a required reason; `DELETE` discards
 * the draft so the period can be prepared again. Neither is possible
 * once a settlement is finalized.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
  if (typeof body.adjustmentKes !== 'number') return Response.json({ error: 'adjustmentKes must be a number' }, { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason : '';

  try {
    const existing = await machineSettlementService.findById(session.businessId, id);
    const { before, after } = await machineSettlementService.setAdjustment(session.businessId, id, body.adjustmentKes, reason, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'adjust_settlement',
      entityType: 'machineSettlement',
      entityId: id,
      before: { adjustmentKes: before },
      after: { adjustmentKes: after, reason: reason.trim() || null },
      machineId: existing?.machineId ?? null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineSettlementNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof SettlementChangeRefusedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owner_finance.settlements.manage')) return forbiddenForPermission('owner_finance.settlements.manage');
  const { id } = await params;
  try {
    const discarded = await machineSettlementService.discardDraft(session.businessId, id);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'discard_settlement_draft',
      entityType: 'machineSettlement',
      entityId: id,
      before: {
        partnerId: discarded.partnerId,
        periodStart: discarded.periodStart.toDate().toISOString(),
        periodEnd: discarded.periodEnd.toDate().toISOString(),
        grossSalesKes: discarded.grossSalesKes,
        cogsKes: discarded.cogsKes,
        subscriptionChargedKes: discarded.subscriptionChargedKes,
        distributableOwnerKes: discarded.distributableOwnerKes,
        adjustmentKes: discarded.adjustmentKes,
      },
      after: null,
      machineId: discarded.machineId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineSettlementNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof SettlementChangeRefusedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

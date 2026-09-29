import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { machineSettlementService, MachineSettlementNotFoundError, IllegalSettlementTransitionError, SettlementChangeRefusedError } from '@/services/machineSettlementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/**
 * Finalizes a `draft` settlement and credits `distributableOwnerKes +
 * adjustmentKes` to the partner's wallet, exactly once
 * (§ SETTLEMENT: "must be idempotent. Do not double-credit an owner if
 * settlement runs twice") — see `MachineSettlementService.finalize`'s
 * own doc comment for the transactional guarantee. `ADMIN_ONLY`: this
 * is the one write in this whole domain that actually moves money into
 * a partner's withdrawable balance.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owner_finance.settlements.finalize')) {
    return forbiddenForPermission('owner_finance.settlements.finalize');
  }

  const { id } = await params;
  // The caller states the amount they reviewed; it has to match what finalize credits.
  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Send the amount you reviewed as expectedAmountKes.' }, { status: 400 });
  }
  if (typeof body.expectedAmountKes !== 'number' || !Number.isInteger(body.expectedAmountKes)) {
    return Response.json({ error: 'Send the amount you reviewed as expectedAmountKes.' }, { status: 400 });
  }
  try {
    const before = await machineSettlementService.findById(session.businessId, id);
    await machineSettlementService.finalize(session.businessId, id, session.uid, body.expectedAmountKes);
    const after = await machineSettlementService.findById(session.businessId, id);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'finalize_settlement',
      entityType: 'machineSettlement',
      entityId: id,
      before: before ? { status: before.status } : null,
      after: after ? { status: after.status, distributableOwnerKes: after.distributableOwnerKes, adjustmentKes: after.adjustmentKes } : null,
      machineId: after?.machineId ?? before?.machineId ?? null,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MachineSettlementNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalSettlementTransitionError || error instanceof SettlementChangeRefusedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

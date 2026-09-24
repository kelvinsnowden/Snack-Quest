import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_ONLY, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineSettlementService, OverlappingSettlementPeriodError } from '@/services/machineSettlementService';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeMachineSettlement } from '@/lib/vending/serialize';

/**
 * A machine's own settlement history (§ MACHINE ECONOMICS, § SETTLEMENT,
 * docs/MACHINE_COMMERCE.md §3/§4). `POST` computes and persists a new
 * `draft` (gross/COGS/subscription/distributable) for a period — it
 * never credits anyone; that only happens on
 * `POST /api/vending/settlements/{id}/finalize`, deliberately a
 * separate, `ADMIN_ONLY` step.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const rows = await machineSettlementService.listByMachine(session.businessId, id);
  return Response.json({ settlements: rows.map(({ id: settlementId, data }) => serializeMachineSettlement(settlementId, data)) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { periodStart, periodEnd } = (body ?? {}) as Record<string, unknown>;
  const parsedStart = typeof periodStart === 'string' ? new Date(periodStart) : null;
  const parsedEnd = typeof periodEnd === 'string' ? new Date(periodEnd) : null;
  if (!parsedStart || Number.isNaN(parsedStart.getTime()) || !parsedEnd || Number.isNaN(parsedEnd.getTime())) {
    return Response.json({ error: 'periodStart and periodEnd must be ISO date strings' }, { status: 400 });
  }
  if (parsedEnd <= parsedStart) {
    return Response.json({ error: 'periodEnd must be after periodStart' }, { status: 400 });
  }

  const machine = await machineRepository.findById(session.businessId, id);
  if (!machine) {
    return Response.json({ error: new MachineNotFoundError(id).message }, { status: 404 });
  }
  if (!machine.ownerPartnerId) {
    return Response.json({ error: `Machine ${id} has no ownerPartnerId to settle against` }, { status: 409 });
  }

  try {
    const settlementId = await machineSettlementService.createDraft({
      businessId: session.businessId,
      machineId: id,
      partnerId: machine.ownerPartnerId,
      periodStart: parsedStart,
      periodEnd: parsedEnd,
      actor: session.uid,
    });
    return Response.json({ settlementId }, { status: 201 });
  } catch (error) {
    if (error instanceof OverlappingSettlementPeriodError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { locationService, LocationNotFoundError } from '@/services/locationService';
import { machineRepository } from '@/repositories/machineRepository';

/**
 * § PART 7 — OWNER VS LOCATION ECONOMICS. Owner-entered only; never
 * read by `machineSettlementService` (see `LocationOwnerExpenses`'s
 * own doc comment) — these numbers inform the owner's *own*
 * profitability picture, not Snack Quest's.
 *
 * Ownership here means "the partner has at least one machine at this
 * location" — a location can in principle host more than one
 * partner's machines, and someone with a machine there has a
 * legitimate reason to know and edit the site's own costs; someone
 * with no machine there has no route to this location's id at all
 * (they'd have to already know it, and get 404 either way).
 */
async function assertPartnerHasMachineAtLocation(businessId: string, partnerId: string, locationId: string): Promise<boolean> {
  const machines = await machineRepository.listByLocation(businessId, locationId);
  return machines.some((machine) => machine.data.ownerPartnerId === partnerId);
}

export async function PUT(request: Request, { params }: { params: Promise<{ locationId: string }> }): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { locationId } = await params;
  const hasMachine = await assertPartnerHasMachineAtLocation(session.businessId, session.partnerId, locationId);
  if (!hasMachine) {
    return Response.json({ error: `Location ${locationId} not found` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { monthlyRentKes, placementFeeKes, monthlyElectricityKes, locationCommissionPct } = (body ?? {}) as Record<string, unknown>;
  const fields = { monthlyRentKes, placementFeeKes, monthlyElectricityKes, locationCommissionPct };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
      return Response.json({ error: `${key} must be a number or null` }, { status: 400 });
    }
  }

  try {
    await locationService.setOwnerExpenses(
      session.businessId,
      locationId,
      {
        monthlyRentKes: (monthlyRentKes as number | null) ?? null,
        placementFeeKes: (placementFeeKes as number | null) ?? null,
        monthlyElectricityKes: (monthlyElectricityKes as number | null) ?? null,
        locationCommissionPct: (locationCommissionPct as number | null) ?? null,
      },
      session.uid,
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

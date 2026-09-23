import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { serializeMachineAssortment } from '@/lib/vending/serialize';
import type { MachineAssortment } from '@/types';

type RouteParams = { id: string; productCatalogue: string; productId: string };

/**
 * The mutations that exist without a full re-assort (§ MACHINE
 * ASSORTMENT): unassort, link/unlink a physical slot, hide/show on the
 * customer screen, and set (or clear) a machine-specific price
 * override. Each field present in the body is applied; fields absent
 * are left untouched — the same "apply whichever fields were given"
 * convention `.../slots` PATCH already uses.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<RouteParams> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id: machineId, productCatalogue: rawCatalogue, productId } = await params;
  if (rawCatalogue !== 'snackItem' && rawCatalogue !== 'package') {
    return Response.json({ error: 'productCatalogue must be one of: snackItem, package' }, { status: 400 });
  }
  const productCatalogue = rawCatalogue as MachineAssortment['productCatalogue'];

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { unassort, slotCode, visible, priceOverrideKes } = (body ?? {}) as Record<string, unknown>;
  if (unassort === undefined && slotCode === undefined && visible === undefined && priceOverrideKes === undefined) {
    return Response.json(
      { error: 'at least one of unassort, slotCode, visible, priceOverrideKes is required' },
      { status: 400 },
    );
  }
  if (slotCode !== undefined && slotCode !== null && typeof slotCode !== 'string') {
    return Response.json({ error: 'slotCode must be a string or null' }, { status: 400 });
  }
  if (visible !== undefined && typeof visible !== 'boolean') {
    return Response.json({ error: 'visible must be a boolean' }, { status: 400 });
  }
  if (priceOverrideKes !== undefined && priceOverrideKes !== null && (typeof priceOverrideKes !== 'number' || !Number.isFinite(priceOverrideKes) || priceOverrideKes < 0)) {
    return Response.json({ error: 'priceOverrideKes must be a non-negative number or null' }, { status: 400 });
  }

  try {
    if (unassort === true) {
      await machineAssortmentService.unassortProduct(session.businessId, machineId, productCatalogue, productId);
    }
    if (slotCode !== undefined) {
      await machineAssortmentService.linkSlot(session.businessId, machineId, productCatalogue, productId, slotCode as string | null);
    }
    if (visible !== undefined) {
      await machineAssortmentService.setVisible(session.businessId, machineId, productCatalogue, productId, visible as boolean);
    }
    if (priceOverrideKes !== undefined) {
      await machineAssortmentService.setPriceOverride(
        session.businessId,
        machineId,
        productCatalogue,
        productId,
        priceOverrideKes as number | null,
        session.uid,
      );
    }
    const rows = await machineAssortmentService.listByMachine(session.businessId, machineId);
    const updated = rows.find((row) => row.productCatalogue === productCatalogue && row.productId === productId);
    return Response.json({ assortment: updated ? serializeMachineAssortment(updated) : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'could not update assortment' }, { status: 400 });
  }
}

/** The price-override audit trail for one product on one machine (§ MACHINE-SPECIFIC PRICING). */
export async function GET(
  request: Request,
  { params }: { params: Promise<RouteParams> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id: machineId, productId } = await params;
  const history = await machineAssortmentRepository.listPriceHistory(session.businessId, machineId, productId);
  return Response.json({
    priceHistory: history.map((entry) => ({
      previousPriceOverrideKes: entry.previousPriceOverrideKes,
      newPriceOverrideKes: entry.newPriceOverrideKes,
      actor: entry.actor,
      createdAt: entry.createdAt.toDate().toISOString(),
    })),
  });
}

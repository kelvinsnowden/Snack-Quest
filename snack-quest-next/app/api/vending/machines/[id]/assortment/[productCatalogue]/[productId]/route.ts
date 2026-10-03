import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { machineAssortmentService, MerchandisingValidationError, type MerchandisingPatch } from '@/services/machineAssortmentService';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { serializeMachineAssortment } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { MachineAssortment } from '@/types';
import { hasPermission, hasAnyPermission, forbiddenForPermission } from '@/lib/auth/permissions';

type RouteParams = { id: string; productCatalogue: string; productId: string };

/**
 * The mutations that exist without a full re-assort (§ MACHINE
 * ASSORTMENT): unassort, link/unlink a physical slot, hide/show on the
 * customer screen, set (or clear) a machine-specific price override,
 * and how the product looks on this machine's screen — name, short
 * description, photo, category, position and badge (`null` clears a
 * machine-specific value back to the product's own). Each field present
 * in the body is applied; fields absent are left untouched — the same
 * "apply whichever fields were given" convention `.../slots` PATCH
 * already uses.
 */
const MERCHANDISING_TEXT_FIELDS = ['customerFacingName', 'customerFacingDescription', 'customerFacingImageUrl', 'category'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<RouteParams> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasAnyPermission(session, ['machine_catalog.manage', 'machine_screen.manage', 'pricing.manage'])) {
    return forbiddenForPermission('machine_catalog.manage');
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

  const fields = (body ?? {}) as Record<string, unknown>;
  const { unassort, slotCode, visible, priceOverrideKes, displayOrder, promotionalState } = fields;

  const merchandising: MerchandisingPatch = {};
  for (const field of MERCHANDISING_TEXT_FIELDS) {
    const value = fields[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') {
      return Response.json({ error: `${field} must be a string or null` }, { status: 400 });
    }
    merchandising[field] = value;
  }
  if (displayOrder !== undefined) {
    if (typeof displayOrder !== 'number') {
      return Response.json({ error: 'displayOrder must be a number' }, { status: 400 });
    }
    merchandising.displayOrder = displayOrder;
  }
  if (promotionalState !== undefined) {
    if (typeof promotionalState !== 'string') {
      return Response.json({ error: 'promotionalState must be a string' }, { status: 400 });
    }
    merchandising.promotionalState = promotionalState as MerchandisingPatch['promotionalState'];
  }
  const hasMerchandising = Object.keys(merchandising).length > 0;

  if (unassort === undefined && slotCode === undefined && visible === undefined && priceOverrideKes === undefined && !hasMerchandising) {
    return Response.json(
      { error: 'at least one of unassort, slotCode, visible, priceOverrideKes, customerFacingName, customerFacingDescription, customerFacingImageUrl, category, displayOrder, promotionalState is required' },
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
  // Three different decisions share this endpoint, each with its own
  // permission: what the machine carries, how it looks on the screen, and
  // what a customer is charged. A request is refused whole if any part of
  // it isn't allowed, so nothing half-applies.
  if ((unassort !== undefined || slotCode !== undefined || visible !== undefined) && !hasPermission(session, 'machine_catalog.manage')) {
    return forbiddenForPermission('machine_catalog.manage');
  }
  if (hasMerchandising && !hasPermission(session, 'machine_screen.manage')) {
    return forbiddenForPermission('machine_screen.manage');
  }
  if (priceOverrideKes !== undefined && !hasPermission(session, 'pricing.manage')) {
    return forbiddenForPermission('pricing.manage');
  }

  try {
    const beforeRows = await machineAssortmentService.listByMachine(session.businessId, machineId);
    const before = beforeRows.find((row) => row.productCatalogue === productCatalogue && row.productId === productId);

    if (hasMerchandising) {
      await machineAssortmentService.updateMerchandising(session.businessId, machineId, productCatalogue, productId, merchandising);
    }
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
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action:
        priceOverrideKes !== undefined
          ? 'change_price_override'
          : unassort === true
            ? 'unassort_product'
            : slotCode !== undefined
              ? 'change_slot_link'
              : visible !== undefined
                ? 'change_visibility'
                : 'change_screen_presentation',
      entityType: 'machineAssortment',
      entityId: `${machineId}__${productCatalogue}__${productId}`,
      before: before ? (serializeMachineAssortment(before) as unknown as Record<string, unknown>) : null,
      after: updated ? (serializeMachineAssortment(updated) as unknown as Record<string, unknown>) : null,
      machineId,
    });
    return Response.json({ assortment: updated ? serializeMachineAssortment(updated) : null });
  } catch (error) {
    if (error instanceof MerchandisingValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
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
  if (!hasPermission(session, 'machines.view')) {
    return forbiddenForPermission('machines.view');
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

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineInventoryMovementService, SlotNotFoundError, InsufficientMachineStockError, InvalidStockCountError, DiscrepancyReasonRequiredError } from '@/services/machineInventoryMovementService';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { priceBookService } from '@/services/priceBookService';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { MachineNotFoundError } from '@/repositories/machineRepository';

const REASONS = ['expired', 'damaged', 'returned'] as const;
type Reason = (typeof REASONS)[number];

/**
 * Takes stock out of a slot for a reason (§ TYPED STOCK REMOVAL, FA-08):
 * `{ slotCode, quantity, reason: expired | damaged | returned, note }`.
 * Writes the slot movement and the transfer-ledger entry together, with the
 * stock's owner and cost at that moment. `machine_inventory.adjust`; audited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machine_inventory.adjust')) return forbiddenForPermission('machine_inventory.adjust');
  const { id: machineId } = await params;
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { slotCode, quantity, reason, note } = body;
  if (typeof slotCode !== 'string' || !slotCode) return Response.json({ error: 'slotCode is required' }, { status: 400 });
  if (typeof quantity !== 'number') return Response.json({ error: 'quantity must be a whole number above zero' }, { status: 400 });
  if (typeof reason !== 'string' || !(REASONS as readonly string[]).includes(reason)) return Response.json({ error: `reason must be one of: ${REASONS.join(', ')}` }, { status: 400 });
  if (typeof note !== 'string' || !note.trim()) return Response.json({ error: 'Say what happened (note).' }, { status: 400 });

  try {
    const slot = await machineSlotRepository.findBySlotCode(session.businessId, machineId, slotCode);
    if (!slot) throw new SlotNotFoundError(machineId, slotCode);
    const profile = await machineEconomicProfileService.resolve(session.businessId, machineId);
    const prices = slot.productId && slot.productCatalogue ? await priceBookService.currentPrices(session.businessId, slot.productCatalogue, slot.productId) : null;
    const ownerStocked = Boolean(profile.partnerId && profile.terms.inventoryOwner === 'machine_owner');
    const result = await machineInventoryMovementService.removeStock({
      businessId: session.businessId,
      machineId,
      slotId: slotCode,
      quantity,
      reason: reason as Reason,
      note,
      actor: session.uid,
      ownership: {
        owner: ownerStocked ? 'machine_owner' : 'snack_quest',
        partnerId: ownerStocked ? profile.partnerId : null,
        unitCostBasisKes: ownerStocked ? (prices?.ownerWholesaleKes ?? null) : (prices?.landedCostKes ?? null),
      },
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'machine_stock.remove',
      entityType: 'machineSlot',
      entityId: `${machineId}__${slotCode}`,
      before: { quantity: result.afterQuantity + quantity },
      after: { quantity: result.afterQuantity, removed: quantity, reason, note: note.trim() },
      machineId,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SlotNotFoundError || error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof InsufficientMachineStockError) return Response.json({ error: 'The slot doesn’t hold that many.' }, { status: 409 });
    if (error instanceof InvalidStockCountError || error instanceof DiscrepancyReasonRequiredError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

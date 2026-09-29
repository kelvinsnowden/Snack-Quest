import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSlotService, SlotChangeRefusedError, SlotMappingError } from '@/services/machineSlotService';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeMachineSlot } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Create or edit one slot: product, capacity, position and price
 * (`machines.slots.configure`). Setting a price — any price on a new
 * slot, or a different one on an existing slot — also needs
 * `pricing.manage`, checked before anything is written. Stock is never
 * set here; it only moves through restocks, sales and adjustments.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; slotCode: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.slots.configure')) return forbiddenForPermission('machines.slots.configure');
  const { id, slotCode } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { productId, productCatalogue, priceKes, capacity, position } = body;
  if (productId !== null && (typeof productId !== 'string' || !productId)) return Response.json({ error: 'productId must be a product id or null' }, { status: 400 });
  if (productId !== null && productCatalogue !== 'snackItem' && productCatalogue !== 'package') return Response.json({ error: 'productCatalogue must be snackItem or package' }, { status: 400 });
  for (const [name, value] of [['priceKes', priceKes], ['capacity', capacity], ['position', position]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return Response.json({ error: `${name} must be a number` }, { status: 400 });
  }

  const existing = await machineSlotRepository.findBySlotCode(session.businessId, id, slotCode);
  if ((!existing || existing.priceKes !== priceKes) && !hasPermission(session, 'pricing.manage')) {
    return forbiddenForPermission('pricing.manage');
  }

  try {
    const { before, after } = await machineSlotService.editSlot({
      businessId: session.businessId,
      machineId: id,
      slotCode,
      productId: productId as string | null,
      productCatalogue: productId === null ? null : (productCatalogue as 'snackItem' | 'package'),
      priceKes: priceKes as number,
      capacity: capacity as number,
      position: position as number,
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: before ? 'configure_slot' : 'create_slot',
      entityType: 'machineSlot',
      entityId: `${id}__${slotCode}`,
      before: before ? { productId: before.productId, productCatalogue: before.productCatalogue, priceKes: before.priceKes, capacity: before.capacity, position: before.position } : null,
      after: after ? { productId: after.productId, productCatalogue: after.productCatalogue, priceKes: after.priceKes, capacity: after.capacity, position: after.position } : null,
      machineId: id,
    });
    return Response.json({ slot: after ? serializeMachineSlot(after) : null }, { status: before ? 200 : 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof SlotChangeRefusedError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof SlotMappingError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

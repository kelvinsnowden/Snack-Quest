import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { machineInventoryMovementService, InsufficientMachineStockError, SlotNotFoundError } from '@/services/machineInventoryMovementService';
import { serializeRestockTask } from '@/lib/vending/serialize';

/**
 * `GET` — a machine's restock tasks, the queue `machineSlotService.checkLowStock`
 * opens automatically (§ RESTOCKING SYSTEM). `POST` — the physical act
 * of refilling a slot: records the real inventory movement (never
 * touches `currentQuantity` directly — see `MachineInventoryMovementService`'s
 * own doc comment) and, when `taskId` is given, closes the task that
 * refill satisfies.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const machineId = url.searchParams.get('machineId');
  if (!machineId) {
    return Response.json({ error: 'machineId query parameter is required' }, { status: 400 });
  }
  const openOnly = url.searchParams.get('openOnly') === 'true';

  const tasks = openOnly
    ? await restockTaskRepository.listOpenByMachine(session.businessId, machineId)
    : await restockTaskRepository.listByMachine(session.businessId, machineId);

  return Response.json({ tasks: tasks.map(({ id, data }) => serializeRestockTask(id, data)) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { machineId, slotId, quantityAdded, taskId, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof machineId !== 'string' || !machineId) {
    return Response.json({ error: 'machineId is required' }, { status: 400 });
  }
  if (typeof slotId !== 'string' || !slotId) {
    return Response.json({ error: 'slotId is required' }, { status: 400 });
  }
  if (typeof quantityAdded !== 'number' || !Number.isInteger(quantityAdded) || quantityAdded <= 0) {
    return Response.json({ error: 'quantityAdded must be a positive integer' }, { status: 400 });
  }
  if (taskId !== undefined && typeof taskId !== 'string') {
    return Response.json({ error: 'taskId must be a string when provided' }, { status: 400 });
  }
  if (note !== undefined && typeof note !== 'string') {
    return Response.json({ error: 'note must be a string when provided' }, { status: 400 });
  }

  try {
    const { afterQuantity } = await machineInventoryMovementService.recordMovement({
      businessId: session.businessId,
      machineId,
      slotId,
      reason: 'restock',
      quantityDelta: quantityAdded,
      note: (note as string | undefined) ?? null,
      actor: session.uid,
    });

    let taskCompleted = false;
    if (typeof taskId === 'string') {
      await restockTaskRepository.updateStatus(session.businessId, taskId, 'completed', session.uid);
      taskCompleted = true;
    }

    return Response.json({ afterQuantity, taskCompleted });
  } catch (error) {
    if (error instanceof SlotNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InsufficientMachineStockError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'could not record restock' }, { status: 400 });
  }
}

import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { restockTaskService, RestockTaskHasNoItemsError, RestockTaskQuantityError, SlotNotFoundError } from '@/services/restockTaskService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { serializeRestockTask } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * A machine's restock tasks (§ RESTOCKING, docs/INVENTORY_ARCHITECTURE.md
 * §5). `GET` — the queue, either every task or just the open
 * (non-terminal) ones; the same list `machineSlotService.checkLowStock`
 * opens into automatically and a staff member can also open into by
 * hand via `POST`. Every subsequent stage — approve, start picking,
 * dispatch, mark in transit, receive, cancel — is its own route under
 * `/api/vending/restock/{taskId}/*`, not a body-shape switch on this
 * one, because each is a genuinely different real-world action with
 * its own actor and its own required data.
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

  const { machineId, items, warehouseId, priority, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof machineId !== 'string' || !machineId) {
    return Response.json({ error: 'machineId is required' }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  for (const item of items) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).slotId !== 'string' ||
      typeof (item as Record<string, unknown>).quantityNeeded !== 'number'
    ) {
      return Response.json({ error: 'each item needs a slotId (string) and quantityNeeded (number)' }, { status: 400 });
    }
  }
  if (priority !== undefined && !['low', 'normal', 'high'].includes(priority as string)) {
    return Response.json({ error: 'priority must be one of: low, normal, high' }, { status: 400 });
  }

  try {
    const taskId = await restockTaskService.createDraft({
      businessId: session.businessId,
      machineId,
      items: (items as Record<string, unknown>[]).map((item) => ({
        slotId: item.slotId as string,
        productId: typeof item.productId === 'string' ? item.productId : null,
        quantityNeeded: item.quantityNeeded as number,
      })),
      warehouseId: typeof warehouseId === 'string' ? warehouseId : undefined,
      priority: priority as 'low' | 'normal' | 'high' | undefined,
      note: typeof note === 'string' ? note : undefined,
      actor: session.uid,
    });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'create_restock_task',
      entityType: 'restockTask',
      entityId: taskId,
      after: { machineId, items, warehouseId: warehouseId ?? null, priority: priority ?? 'normal' },
      machineId,
    });
    return Response.json({ taskId }, { status: 201 });
  } catch (error) {
    if (error instanceof MachineNotFoundError || error instanceof SlotNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof RestockTaskHasNoItemsError || error instanceof RestockTaskQuantityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

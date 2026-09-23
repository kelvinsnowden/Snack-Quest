import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  restockTaskRepository,
  RestockTaskNotFoundError,
  IllegalRestockTaskTransitionError,
} from '@/repositories/restockTaskRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { SlotNotFoundError } from '@/services/machineInventoryMovementService';
import type { RestockTask, RestockTaskItem, RestockTaskStatus } from '@/types';

export { RestockTaskNotFoundError, IllegalRestockTaskTransitionError, SlotNotFoundError };

export class RestockTaskHasNoItemsError extends Error {
  constructor() {
    super('A restock task needs at least one item');
    this.name = 'RestockTaskHasNoItemsError';
  }
}

export class RestockTaskItemMismatchError extends Error {
  constructor(taskId: string, slotId: string) {
    super(`Slot ${slotId} is not part of restock task ${taskId}`);
    this.name = 'RestockTaskItemMismatchError';
  }
}

export class RestockTaskItemIncompleteError extends Error {
  constructor(taskId: string, slotId: string, stage: string) {
    super(`Restock task ${taskId}: no ${stage} quantity given for slot ${slotId}`);
    this.name = 'RestockTaskItemIncompleteError';
  }
}

export class RestockTaskQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestockTaskQuantityError';
  }
}

/**
 * The restock workflow's real orchestration
 * (§ RESTOCKING, docs/INVENTORY_ARCHITECTURE.md §5) — the pick →
 * dispatch → transit → receive chain, rebuilt from the old flat
 * 5-state model. Every stage transition goes through
 * `restockTaskRepository.moveStatus[InTransaction]`, which itself
 * checks `RESTOCK_TASK_STATUS_TRANSITIONS` before writing — this
 * service never sets `status` directly, so a stage can never be
 * skipped or a terminal task resurrected through this layer either.
 *
 * `receive()` is the one method that touches real inventory. It runs
 * as a single Firestore transaction spanning the task document AND
 * every slot document a received item touches — not two separate
 * writes with a gap between them — because a crash between "recorded
 * received" and "added the stock to the slot" would be exactly the
 * kind of ledger/cache disagreement `MachineInventoryMovementService`'s
 * own doc comment exists to prevent. Firestore transactions require
 * every read to happen before any write; `receive()` reads the task
 * and every slot it needs first, then writes the movements, the slot
 * quantities, and the task's own new status/items together.
 */
class RestockTaskService {
  async createDraft(input: {
    businessId: string;
    machineId: string;
    items: { slotId: string; productId: string | null; quantityNeeded: number }[];
    warehouseId?: string | null;
    priority?: RestockTask['priority'];
    note?: string | null;
    actor: string;
  }): Promise<string> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    if (input.items.length === 0) {
      throw new RestockTaskHasNoItemsError();
    }
    for (const item of input.items) {
      if (!Number.isInteger(item.quantityNeeded) || item.quantityNeeded <= 0) {
        throw new RestockTaskQuantityError(`quantityNeeded for slot ${item.slotId} must be a positive integer`);
      }
      const slot = await machineSlotRepository.findBySlotCode(input.businessId, input.machineId, item.slotId);
      if (!slot) {
        throw new SlotNotFoundError(input.machineId, item.slotId);
      }
    }

    const items: RestockTaskItem[] = input.items.map((item) => ({
      slotId: item.slotId,
      productId: item.productId,
      quantityNeeded: item.quantityNeeded,
      quantityDispatched: null,
      quantityReceived: null,
      discrepancyQuantity: null,
      batchId: null,
      expiresAt: null,
    }));

    return restockTaskRepository.create({
      businessId: input.businessId,
      machineId: input.machineId,
      warehouseId: input.warehouseId ?? null,
      items,
      status: 'draft',
      priority: input.priority ?? 'normal',
      discrepancyNote: null,
      note: input.note ?? null,
      createdBy: input.actor,
    });
  }

  /** `draft → approved` — the review gate before anyone starts picking. `warehouseId` can be assigned here if it wasn't known when the task was opened (an auto-opened low-stock task never knows one at creation). */
  async approve(businessId: string, taskId: string, actor: string, warehouseId?: string | null): Promise<void> {
    await restockTaskRepository.moveStatus(businessId, taskId, 'approved', actor, warehouseId !== undefined ? { warehouseId } : {});
  }

  /** `approved → picking` — records who's picking and when they started. */
  async startPicking(businessId: string, taskId: string, actor: string): Promise<void> {
    await restockTaskRepository.moveStatus(businessId, taskId, 'picking', actor, {
      pickedBy: actor,
      pickedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * `picking → dispatched` — the dispatcher states what's actually
   * being sent, which may differ from `quantityNeeded` (partial stock
   * on hand, a deliberate top-up decision) — never assumed to equal
   * the original plan. Every item on the task must be covered; a
   * `slotId` given here that isn't part of the task is rejected
   * rather than silently added.
   */
  async dispatch(
    businessId: string,
    taskId: string,
    actor: string,
    items: { slotId: string; quantityDispatched: number; batchId?: string | null; expiresAt?: Date | null }[],
  ): Promise<void> {
    await adminFirestore.runTransaction(async (tx) => {
      const found = await restockTaskRepository.getInTransaction(tx, businessId, taskId);
      if (!found) {
        throw new RestockTaskNotFoundError(taskId);
      }
      const bySlot = new Map(items.map((item) => [item.slotId, item]));
      for (const given of items) {
        if (!found.data.items.some((existing) => existing.slotId === given.slotId)) {
          throw new RestockTaskItemMismatchError(taskId, given.slotId);
        }
        if (!Number.isInteger(given.quantityDispatched) || given.quantityDispatched < 0) {
          throw new RestockTaskQuantityError(`quantityDispatched for slot ${given.slotId} must be a non-negative integer`);
        }
      }
      const mergedItems: RestockTaskItem[] = found.data.items.map((existing) => {
        const given = bySlot.get(existing.slotId);
        if (!given) {
          throw new RestockTaskItemIncompleteError(taskId, existing.slotId, 'dispatched');
        }
        return {
          ...existing,
          quantityDispatched: given.quantityDispatched,
          batchId: given.batchId ?? null,
          expiresAt: given.expiresAt ? (Timestamp.fromDate(given.expiresAt) as unknown as RestockTaskItem['expiresAt']) : null,
        };
      });

      restockTaskRepository.moveStatusInTransaction(tx, found.ref, found.data.status, 'dispatched', actor, {
        items: mergedItems,
        dispatchedBy: actor,
        dispatchedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  /** `dispatched → in_transit` — no new data, just the fact that the shipment has left. */
  async markInTransit(businessId: string, taskId: string, actor: string): Promise<void> {
    await restockTaskRepository.moveStatus(businessId, taskId, 'in_transit', actor);
  }

  /**
   * `in_transit → received | partially_received` — the one call that
   * actually adds stock. Which terminal state it lands on is derived,
   * never chosen by the caller: any item received short of what was
   * dispatched makes the whole task `partially_received`, with the
   * exact shortfall recorded per item (`discrepancyQuantity`), never
   * silently rounded to "close enough". Every item must be accounted
   * for — omitting one is rejected, not treated as "nothing arrived".
   */
  async receive(
    businessId: string,
    taskId: string,
    actor: string,
    items: { slotId: string; quantityReceived: number }[],
    discrepancyNote?: string | null,
  ): Promise<{ status: RestockTaskStatus }> {
    return adminFirestore.runTransaction(async (tx) => {
      const found = await restockTaskRepository.getInTransaction(tx, businessId, taskId);
      if (!found) {
        throw new RestockTaskNotFoundError(taskId);
      }
      if (found.data.status !== 'in_transit') {
        throw new IllegalRestockTaskTransitionError(found.data.status, 'received');
      }

      const receivedBySlot = new Map(items.map((item) => [item.slotId, item.quantityReceived]));
      for (const given of items) {
        if (!found.data.items.some((existing) => existing.slotId === given.slotId)) {
          throw new RestockTaskItemMismatchError(taskId, given.slotId);
        }
      }

      let anyDiscrepancy = false;
      const computed = found.data.items.map((existing) => {
        const quantityReceived = receivedBySlot.get(existing.slotId);
        if (quantityReceived === undefined) {
          throw new RestockTaskItemIncompleteError(taskId, existing.slotId, 'received');
        }
        if (!Number.isInteger(quantityReceived) || quantityReceived < 0) {
          throw new RestockTaskQuantityError(`quantityReceived for slot ${existing.slotId} must be a non-negative integer`);
        }
        const quantityDispatched = existing.quantityDispatched ?? 0;
        if (quantityReceived > quantityDispatched) {
          throw new RestockTaskQuantityError(
            `Cannot receive ${quantityReceived} for slot ${existing.slotId} — only ${quantityDispatched} was dispatched`,
          );
        }
        const discrepancyQuantity = quantityDispatched - quantityReceived;
        if (discrepancyQuantity > 0) {
          anyDiscrepancy = true;
        }
        return { existing, quantityReceived, discrepancyQuantity };
      });

      // All reads before all writes — Firestore transactions require it.
      const slotReads = await Promise.all(
        computed
          .filter(({ quantityReceived }) => quantityReceived > 0)
          .map(async ({ existing, quantityReceived, discrepancyQuantity }) => {
            const slot = await machineSlotRepository.getInTransaction(tx, found.data.machineId, existing.slotId);
            if (!slot || slot.businessId !== businessId) {
              throw new SlotNotFoundError(found.data.machineId, existing.slotId);
            }
            return { existing, quantityReceived, discrepancyQuantity, slot };
          }),
      );

      for (const { existing, quantityReceived, slot } of slotReads) {
        const beforeQuantity = slot.currentQuantity;
        const afterQuantity = beforeQuantity + quantityReceived;
        machineSlotRepository.updateQuantityInTransaction(tx, found.data.machineId, existing.slotId, afterQuantity);
        machineInventoryMovementRepository.createInTransaction(tx, {
          businessId,
          machineId: found.data.machineId,
          slotId: existing.slotId,
          productId: slot.productId,
          reason: 'restock',
          quantityDelta: quantityReceived,
          beforeQuantity,
          afterQuantity,
          sourceTransactionId: null,
          restockTaskId: taskId,
          batchId: existing.batchId,
          expiresAt: existing.expiresAt,
          note: `restock task ${taskId}`,
          actor,
        });
      }

      const mergedItems: RestockTaskItem[] = computed.map(({ existing, quantityReceived, discrepancyQuantity }) => ({
        ...existing,
        quantityReceived,
        discrepancyQuantity,
      }));
      const targetStatus: RestockTaskStatus = anyDiscrepancy ? 'partially_received' : 'received';

      restockTaskRepository.moveStatusInTransaction(tx, found.ref, found.data.status, targetStatus, actor, {
        items: mergedItems,
        receivedBy: actor,
        discrepancyNote: anyDiscrepancy ? (discrepancyNote ?? null) : null,
      });

      return { status: targetStatus };
    });
  }

  /** Only offered while nothing has physically left a warehouse yet — see `RESTOCK_TASK_STATUS_TRANSITIONS`'s own doc comment for why `in_transit` has no path here. */
  async cancel(businessId: string, taskId: string, actor: string): Promise<void> {
    await restockTaskRepository.moveStatus(businessId, taskId, 'cancelled', actor);
  }

  async findById(businessId: string, taskId: string): Promise<RestockTask | null> {
    return restockTaskRepository.findById(businessId, taskId);
  }

  async listByMachine(businessId: string, machineId: string) {
    return restockTaskRepository.listByMachine(businessId, machineId);
  }

  async listOpenByMachine(businessId: string, machineId: string) {
    return restockTaskRepository.listOpenByMachine(businessId, machineId);
  }
}

export const restockTaskService = new RestockTaskService();
export { RestockTaskService };

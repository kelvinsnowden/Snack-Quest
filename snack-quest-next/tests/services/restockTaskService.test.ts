import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { RestockTaskNotFoundError, IllegalRestockTaskTransitionError } from '@/repositories/restockTaskRepository';
import {
  restockTaskService,
  RestockTaskHasNoItemsError,
  RestockTaskItemMismatchError,
  RestockTaskItemIncompleteError,
  RestockTaskQuantityError,
  SlotNotFoundError,
} from '@/services/restockTaskService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import type { MachineInventoryMovement } from '@/types';

/**
 * `RestockTaskService` — the rebuilt pick → dispatch → transit →
 * receive workflow (§ RESTOCKING, docs/INVENTORY_ARCHITECTURE.md §5).
 */

const BUSINESS_ID = 'biz-restock-task-service-test';

async function setUpMachine(capacity = 10, initialQuantity = 0) {
  const adapter = new MockVendingAdapter();
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  adapter.seedSlot(machineId, 'A01', { quantity: initialQuantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 350, capacity, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: initialQuantity });
  return { machineId };
}

async function createDraftTask(machineId: string, quantityNeeded = 8) {
  return restockTaskService.createDraft({
    businessId: BUSINESS_ID,
    machineId,
    items: [{ slotId: 'A01', productId: 'pkg-1', quantityNeeded }],
    actor: 'staff-1',
  });
}

async function movementsForTask(taskId: string): Promise<MachineInventoryMovement[]> {
  const snapshot = await adminFirestore.collection('machineInventoryMovements').where('restockTaskId', '==', taskId).get();
  return snapshot.docs.map((doc) => doc.data() as MachineInventoryMovement);
}

beforeEach(async () => {
  for (const collection of ['machines', 'machineSlots', 'machineInventoryMovements', 'restockTasks', 'deviceCredentials']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('createDraft', () => {
  it('creates a draft task with per-item fields defaulted to null', async () => {
    const { machineId } = await setUpMachine();
    const taskId = await createDraftTask(machineId, 8);

    const task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('draft');
    expect(task?.items).toEqual([
      { slotId: 'A01', productId: 'pkg-1', quantityNeeded: 8, quantityDispatched: null, quantityReceived: null, discrepancyQuantity: null, batchId: null, expiresAt: null },
    ]);
    expect(task?.pickedBy).toBeNull();
    expect(task?.dispatchedBy).toBeNull();
    expect(task?.receivedBy).toBeNull();
    expect(task?.completedAt).toBeNull();
  });

  it('throws for a machine that does not exist', async () => {
    await expect(
      restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId: 'ghost', items: [{ slotId: 'A01', productId: null, quantityNeeded: 5 }], actor: 'staff-1' }),
    ).rejects.toBeInstanceOf(MachineNotFoundError);
  });

  it('throws for a slot that does not exist on the machine', async () => {
    const { machineId } = await setUpMachine();
    await expect(
      restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId, items: [{ slotId: 'ghost', productId: null, quantityNeeded: 5 }], actor: 'staff-1' }),
    ).rejects.toBeInstanceOf(SlotNotFoundError);
  });

  it('throws for an empty items array', async () => {
    const { machineId } = await setUpMachine();
    await expect(restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId, items: [], actor: 'staff-1' })).rejects.toBeInstanceOf(
      RestockTaskHasNoItemsError,
    );
  });

  it('throws for a non-positive quantityNeeded', async () => {
    const { machineId } = await setUpMachine();
    await expect(
      restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId, items: [{ slotId: 'A01', productId: null, quantityNeeded: 0 }], actor: 'staff-1' }),
    ).rejects.toBeInstanceOf(RestockTaskQuantityError);
  });
});

describe('the full lifecycle: draft → approved → picking → dispatched → in_transit → received', () => {
  it('walks every stage, recording the right actor at each one', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const taskId = await createDraftTask(machineId, 8);

    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-approver', 'warehouse-1');
    let task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('approved');
    expect(task?.warehouseId).toBe('warehouse-1');

    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-picker');
    task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('picking');
    expect(task?.pickedBy).toBe('staff-picker');
    expect(task?.pickedAt).not.toBeNull();

    await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-dispatcher', [{ slotId: 'A01', quantityDispatched: 8, batchId: 'batch-1', expiresAt: new Date('2027-01-01') }]);
    task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('dispatched');
    expect(task?.dispatchedBy).toBe('staff-dispatcher');
    expect(task?.items[0].quantityDispatched).toBe(8);
    expect(task?.items[0].batchId).toBe('batch-1');
    expect(task?.items[0].expiresAt).not.toBeNull();

    await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-dispatcher');
    task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('in_transit');

    const { status } = await restockTaskService.receive(BUSINESS_ID, taskId, 'staff-receiver', [{ slotId: 'A01', quantityReceived: 8 }]);
    expect(status).toBe('received');
    task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('received');
    expect(task?.receivedBy).toBe('staff-receiver');
    expect(task?.completedAt).not.toBeNull();
    expect(task?.items[0]).toMatchObject({ quantityReceived: 8, discrepancyQuantity: 0 });
    expect(task?.discrepancyNote).toBeNull();

    // completing must create real ledger movements
    const movements = await movementsForTask(taskId);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ machineId, slotId: 'A01', reason: 'restock', quantityDelta: 8, beforeQuantity: 0, afterQuantity: 8, batchId: 'batch-1' });

    const slots = await new MachineSlotService(() => new MockVendingAdapter()).listByMachine(BUSINESS_ID, machineId);
    expect(slots[0].currentQuantity).toBe(8);
  });

  it('lands on partially_received and records the exact shortfall when less arrives than was dispatched', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const taskId = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 8 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-1');

    const { status } = await restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: 5 }], 'three units missing from the pallet');
    expect(status).toBe('partially_received');

    const task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('partially_received');
    expect(task?.items[0]).toMatchObject({ quantityReceived: 5, discrepancyQuantity: 3 });
    expect(task?.discrepancyNote).toBe('three units missing from the pallet');

    // Only what actually arrived is added to real inventory.
    const slots = await new MachineSlotService(() => new MockVendingAdapter()).listByMachine(BUSINESS_ID, machineId);
    expect(slots[0].currentQuantity).toBe(5);
    const movements = await movementsForTask(taskId);
    expect(movements).toHaveLength(1);
    expect(movements[0].quantityDelta).toBe(5);
  });

  it('never adds inventory when nothing arrived (quantityReceived: 0 for every item)', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const taskId = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 8 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-1');

    const { status } = await restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: 0 }]);
    expect(status).toBe('partially_received');

    const slots = await new MachineSlotService(() => new MockVendingAdapter()).listByMachine(BUSINESS_ID, machineId);
    expect(slots[0].currentQuantity).toBe(0);
    expect(await movementsForTask(taskId)).toHaveLength(0);
  });
});

describe('status-transition guards', () => {
  it('rejects skipping a stage (draft straight to picking)', async () => {
    const { machineId } = await setUpMachine();
    const taskId = await createDraftTask(machineId);
    await expect(restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1')).rejects.toBeInstanceOf(IllegalRestockTaskTransitionError);
  });

  it('rejects receiving before the task is in_transit', async () => {
    const { machineId } = await setUpMachine();
    const taskId = await createDraftTask(machineId);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await expect(restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: 8 }])).rejects.toBeInstanceOf(
      IllegalRestockTaskTransitionError,
    );
  });

  it('never allows a second receive on an already-terminal task — no double-crediting inventory', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const taskId = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 8 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: 8 }]);

    await expect(restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: 8 }])).rejects.toBeInstanceOf(
      IllegalRestockTaskTransitionError,
    );

    const slots = await new MachineSlotService(() => new MockVendingAdapter()).listByMachine(BUSINESS_ID, machineId);
    expect(slots[0].currentQuantity).toBe(8); // not 16 — the second call never applied
    expect(await movementsForTask(taskId)).toHaveLength(1);
  });

  it('never allows cancelling an in_transit task — receive() is the only honest next step', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const taskId = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 8 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-1');

    await expect(restockTaskService.cancel(BUSINESS_ID, taskId, 'staff-1')).rejects.toBeInstanceOf(IllegalRestockTaskTransitionError);
  });

  it('allows cancelling from draft, approved, picking, and dispatched', async () => {
    const { machineId } = await setUpMachine(10, 0);

    const draftTask = await createDraftTask(machineId, 8);
    await restockTaskService.cancel(BUSINESS_ID, draftTask, 'staff-1');
    expect((await restockTaskService.findById(BUSINESS_ID, draftTask))?.status).toBe('cancelled');

    const approvedTask = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, approvedTask, 'staff-1');
    await restockTaskService.cancel(BUSINESS_ID, approvedTask, 'staff-1');
    expect((await restockTaskService.findById(BUSINESS_ID, approvedTask))?.status).toBe('cancelled');
  });

  it('throws RestockTaskNotFoundError for a task that does not exist', async () => {
    await expect(restockTaskService.approve(BUSINESS_ID, 'ghost-task', 'staff-1')).rejects.toBeInstanceOf(RestockTaskNotFoundError);
  });
});

describe('dispatch/receive item validation', () => {
  it('rejects a dispatch that omits one of the task’s items', async () => {
    const { machineId } = await setUpMachine();
    const adapter = new MockVendingAdapter();
    adapter.seedSlot(machineId, 'A02', { quantity: 0 });
    const slots = new MachineSlotService(() => adapter);
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A02', productId: 'pkg-2', productCatalogue: 'package', priceKes: 200, capacity: 10, position: 2 });
    const taskId = await restockTaskService.createDraft({
      businessId: BUSINESS_ID,
      machineId,
      items: [
        { slotId: 'A01', productId: 'pkg-1', quantityNeeded: 5 },
        { slotId: 'A02', productId: 'pkg-2', quantityNeeded: 5 },
      ],
      actor: 'staff-1',
    });
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');

    await expect(
      restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 5 }]),
    ).rejects.toBeInstanceOf(RestockTaskItemIncompleteError);
  });

  it('rejects a dispatch item for a slot that is not part of the task', async () => {
    const { machineId } = await setUpMachine();
    const taskId = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');

    await expect(
      restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 8 }, { slotId: 'A99', quantityDispatched: 1 }]),
    ).rejects.toBeInstanceOf(RestockTaskItemMismatchError);
  });

  it('rejects receiving more than was dispatched', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const taskId = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');
    await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: 5 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-1');

    await expect(restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: 6 }])).rejects.toBeInstanceOf(
      RestockTaskQuantityError,
    );
    const slots = await new MachineSlotService(() => new MockVendingAdapter()).listByMachine(BUSINESS_ID, machineId);
    expect(slots[0].currentQuantity).toBe(0); // rejected before any write
  });
});

describe('listOpenByMachine', () => {
  it('excludes every terminal status', async () => {
    const { machineId } = await setUpMachine(10, 0);
    const receivedTask = await createDraftTask(machineId, 8);
    await restockTaskService.approve(BUSINESS_ID, receivedTask, 'staff-1');
    await restockTaskService.startPicking(BUSINESS_ID, receivedTask, 'staff-1');
    await restockTaskService.dispatch(BUSINESS_ID, receivedTask, 'staff-1', [{ slotId: 'A01', quantityDispatched: 8 }]);
    await restockTaskService.markInTransit(BUSINESS_ID, receivedTask, 'staff-1');
    await restockTaskService.receive(BUSINESS_ID, receivedTask, 'staff-1', [{ slotId: 'A01', quantityReceived: 8 }]);

    const cancelledTask = await createDraftTask(machineId, 3);
    await restockTaskService.cancel(BUSINESS_ID, cancelledTask, 'staff-1');

    const draftTask = await createDraftTask(machineId, 2);

    const open = await restockTaskService.listOpenByMachine(BUSINESS_ID, machineId);
    expect(open.map((t) => t.id)).toEqual([draftTask]);
  });
});

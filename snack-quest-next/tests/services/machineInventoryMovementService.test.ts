import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { machineSlotService, MachineSlotService } from '@/services/machineSlotService';
import { machineInventoryMovementService, InsufficientMachineStockError, SlotNotFoundError, DiscrepancyReasonRequiredError } from '@/services/machineInventoryMovementService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

const BUSINESS_ID = 'biz-machine-inventory-test';

async function setUpSlot(capacity = 10) {
  const adapter = new MockVendingAdapter();
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-${Date.now()}-${Math.random()}`, serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
  adapter.seedSlot(machineId, 'A01', { quantity: 0 });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 350, capacity, position: 1 });
  return { machineId };
}

beforeEach(async () => {
  for (const collection of ['machines', 'machineSlots', 'machineInventoryMovements', 'restockTasks', 'deviceCredentials']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('recordMovement', () => {
  it('a restock increases quantity and writes a ledger entry with before/after', async () => {
    const { machineId } = await setUpSlot();
    const { afterQuantity } = await machineInventoryMovementService.recordMovement({
      businessId: BUSINESS_ID,
      machineId,
      slotId: 'A01',
      reason: 'restock',
      quantityDelta: 8,
      actor: 'staff-1',
    });

    expect(afterQuantity).toBe(8);
    const slot = await machineSlotService.listByMachine(BUSINESS_ID, machineId);
    expect(slot[0].currentQuantity).toBe(8);
  });

  it('refuses to remove more than is present', async () => {
    const { machineId } = await setUpSlot();
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 2, actor: 'staff-1' });

    await expect(
      machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'sale', quantityDelta: -5, actor: 'staff-1' }),
    ).rejects.toThrow(InsufficientMachineStockError);

    // The rejected movement must not have partially applied.
    const slot = await machineSlotService.listByMachine(BUSINESS_ID, machineId);
    expect(slot[0].currentQuantity).toBe(2);
  });

  it('throws for a slot that does not exist', async () => {
    const { machineId } = await setUpSlot();
    await expect(
      machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'ghost', reason: 'restock', quantityDelta: 5, actor: 'staff-1' }),
    ).rejects.toThrow(SlotNotFoundError);
  });

  it('opens a restock task automatically once a slot crosses below the low-stock threshold', async () => {
    const { machineId } = await setUpSlot(10);
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 10, actor: 'staff-1' });
    // Sell down to exactly 2/10 = 20%, the first point at or below the threshold.
    for (let i = 0; i < 8; i += 1) {
      await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'sale', quantityDelta: -1, actor: 'staff-1' });
    }

    const tasks = await restockTaskRepository.listOpenByMachine(BUSINESS_ID, machineId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].data.items[0].quantityNeeded).toBe(8);
    expect(tasks[0].data.priority).toBe('normal');
  });

  it('does not open a second restock task while one is already open for the same slot', async () => {
    const { machineId } = await setUpSlot(10);
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 2, actor: 'staff-1' });
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'sale', quantityDelta: -1, actor: 'staff-1' });
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'manual_adjustment', quantityDelta: 0, actor: 'staff-1' });

    const tasks = await restockTaskRepository.listOpenByMachine(BUSINESS_ID, machineId);
    expect(tasks).toHaveLength(1);
  });

  it('marks priority high when the slot reaches exactly zero', async () => {
    const { machineId } = await setUpSlot(10);
    // Restock above the threshold first so no task opens yet, then sell the whole batch in one movement.
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, actor: 'staff-1' });
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'sale', quantityDelta: -5, actor: 'staff-1' });

    const tasks = await restockTaskRepository.listOpenByMachine(BUSINESS_ID, machineId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].data.priority).toBe('high');
  });
});

describe('reconcile', () => {
  it('reports a match when the cache agrees with the ledger', async () => {
    const { machineId } = await setUpSlot();
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 10, actor: 'staff-1' });
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'sale', quantityDelta: -3, actor: 'staff-1' });
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'waste', quantityDelta: -1, actor: 'staff-1' });

    const result = await machineInventoryMovementService.reconcile(BUSINESS_ID, machineId, 'A01');
    expect(result).toEqual({ cached: 6, ledgerDerived: 6, matches: true });
  });

  it('detects a mismatch when the cache is written outside the ledger', async () => {
    const { machineId } = await setUpSlot();
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, actor: 'staff-1' });

    // Simulate something writing to the slot outside this service —
    // exactly the bug `reconcile` exists to catch.
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 999 });

    const result = await machineInventoryMovementService.reconcile(BUSINESS_ID, machineId, 'A01');
    expect(result).toEqual({ cached: 999, ledgerDerived: 5, matches: false });
  });
});

describe('recordDiscrepancyAdjustment', () => {
  it('writes a manual_adjustment ledger entry sized to the gap between expected and physical count', async () => {
    const { machineId } = await setUpSlot();
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 10, actor: 'staff-1' });

    const result = await machineInventoryMovementService.recordDiscrepancyAdjustment({
      businessId: BUSINESS_ID,
      machineId,
      slotId: 'A01',
      physicalCountQuantity: 7,
      reason: 'Physical count during weekly audit found 3 fewer units',
      actor: 'staff-1',
    });

    expect(result).toEqual({ expectedQuantity: 10, physicalCountQuantity: 7, discrepancy: -3, afterQuantity: 7 });
    const slots = await machineSlotService.listByMachine(BUSINESS_ID, machineId);
    expect(slots[0].currentQuantity).toBe(7);
    const reconciled = await machineInventoryMovementService.reconcile(BUSINESS_ID, machineId, 'A01');
    expect(reconciled.matches).toBe(true); // the ledger and cache agree — the adjustment is itself a real ledger entry, not a side-channel correction
  });

  it('still writes a ledger entry recording the count when it matches exactly — never a silent no-op', async () => {
    const { machineId } = await setUpSlot();
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, actor: 'staff-1' });

    const result = await machineInventoryMovementService.recordDiscrepancyAdjustment({
      businessId: BUSINESS_ID,
      machineId,
      slotId: 'A01',
      physicalCountQuantity: 5,
      reason: 'Weekly count confirmed',
      actor: 'staff-1',
    });
    expect(result.discrepancy).toBe(0);
    expect(result.afterQuantity).toBe(5);
  });

  it('refuses a blank reason', async () => {
    const { machineId } = await setUpSlot();
    await expect(
      machineInventoryMovementService.recordDiscrepancyAdjustment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', physicalCountQuantity: 3, reason: '   ', actor: 'staff-1' }),
    ).rejects.toBeInstanceOf(DiscrepancyReasonRequiredError);
  });

  it('throws SlotNotFoundError for a slot that does not exist', async () => {
    const { machineId } = await setUpSlot();
    await expect(
      machineInventoryMovementService.recordDiscrepancyAdjustment({ businessId: BUSINESS_ID, machineId, slotId: 'Z99', physicalCountQuantity: 3, reason: 'count', actor: 'staff-1' }),
    ).rejects.toBeInstanceOf(SlotNotFoundError);
  });
});

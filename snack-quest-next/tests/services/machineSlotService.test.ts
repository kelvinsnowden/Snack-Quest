import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService, MachineNotFoundError } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * `MachineSlotService.setPrice`/`setEnabled` write both Firestore and
 * the hardware adapter — the machine's own recorded price/enabled
 * state has to match what it will actually charge/dispense, not just
 * what the admin dashboard shows (§ CORE ENTITIES 2, TESTING:
 * "price updates"). `configureSlot`/`checkLowStock` are already
 * exercised indirectly by `machineTransactionService.test.ts` and
 * `machineInventoryMovementService.test.ts` — this file is specifically
 * about the two update paths those don't cover.
 */

const BUSINESS_ID = 'biz-machine-slot-service-test';

async function provisionMachineWithSlot(adapter: MockVendingAdapter) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  adapter.seedSlot(machineId, 'A01', { quantity: 5 });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({
    businessId: BUSINESS_ID,
    machineId,
    slotCode: 'A01',
    productId: 'pkg-1',
    productCatalogue: 'package',
    priceKes: 350,
    capacity: 10,
    position: 1,
  });
  return { machineId, slots };
}

beforeEach(async () => {
  for (const collection of ['machines', 'machineSlots', 'deviceCredentials']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('setPrice', () => {
  it('updates both the stored slot and the hardware adapter, together', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await provisionMachineWithSlot(adapter);

    await slots.setPrice(BUSINESS_ID, machineId, 'A01', 400);

    const stored = await slots.listByMachine(BUSINESS_ID, machineId);
    expect(stored[0].priceKes).toBe(400);
    const adapterSlots = await adapter.getSlots(machineId);
    expect(adapterSlots.find((s) => s.slotCode === 'A01')?.quantity).toBe(5); // unaffected
  });

  it('throws MachineNotFoundError for a machine in a different business, and touches neither store', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await provisionMachineWithSlot(adapter);

    await expect(slots.setPrice('a-different-business', machineId, 'A01', 999)).rejects.toThrow(MachineNotFoundError);

    const stored = await slots.listByMachine(BUSINESS_ID, machineId);
    expect(stored[0].priceKes).toBe(350); // unchanged
  });
});

describe('setEnabled', () => {
  it('disables both the stored slot and the hardware adapter', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await provisionMachineWithSlot(adapter);

    await slots.setEnabled(BUSINESS_ID, machineId, 'A01', false);

    const stored = await slots.listByMachine(BUSINESS_ID, machineId);
    expect(stored[0].enabled).toBe(false);
    const adapterSlots = await adapter.getSlots(machineId);
    expect(adapterSlots.find((s) => s.slotCode === 'A01')?.enabled).toBe(false);
  });

  it('re-enables a previously disabled slot', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await provisionMachineWithSlot(adapter);

    await slots.setEnabled(BUSINESS_ID, machineId, 'A01', false);
    await slots.setEnabled(BUSINESS_ID, machineId, 'A01', true);

    const stored = await slots.listByMachine(BUSINESS_ID, machineId);
    expect(stored[0].enabled).toBe(true);
    const adapterSlots = await adapter.getSlots(machineId);
    expect(adapterSlots.find((s) => s.slotCode === 'A01')?.enabled).toBe(true);
  });
});

describe('configureSlot', () => {
  it('preserves currentQuantity and enabled state across a re-configuration of the same slot', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await provisionMachineWithSlot(adapter);
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 7, enabled: false });

    await slots.configureSlot({
      businessId: BUSINESS_ID,
      machineId,
      slotCode: 'A01',
      productId: 'pkg-2', // reassigned product
      productCatalogue: 'package',
      priceKes: 500,
      capacity: 12,
      position: 2,
    });

    const stored = await slots.listByMachine(BUSINESS_ID, machineId);
    expect(stored[0].productId).toBe('pkg-2');
    expect(stored[0].priceKes).toBe(500);
    expect(stored[0].currentQuantity).toBe(7); // preserved, not reset to 0
    expect(stored[0].enabled).toBe(false); // preserved
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService, SlotChangeRefusedError, machineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService, SlotUnavailableForSaleError } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * Setting up slots and keeping bad ones from selling. What matters: a
 * slot's product can't be swapped while the old stock is inside, every
 * price change is kept, a copied layout never copies stock or overwrites
 * a loaded slot, and a jam or unknown vend stops the slot selling until
 * someone returns it to sale.
 */

const BUSINESS_ID = 'biz-slot-setup-test';

async function clean() {
  for (const collection of ['machines', 'machineSlots', 'machineSlotPriceHistory', 'machineTransactions', 'machineInventoryMovements', 'machineTelemetryEvents', 'machineDispenseCommands', 'machineEvents', 'machineAssortments', 'machineAssortmentPriceHistory', 'deviceCredentials', 'restockTasks', 'snackItems']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}
beforeEach(clean);
afterEach(clean);

async function machineWithSlot(adapter: MockVendingAdapter, quantity = 3) {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-SLOT-${Math.random().toString(36).slice(2, 9)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', actor: 'staff-1' });
  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 350, capacity: 10, position: 1, actor: 'staff-1' });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId, slots };
}

describe('editing a slot', () => {
  it('won’t swap the product while the old product is still inside, or shrink capacity below the stock', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await machineWithSlot(adapter, 3);
    const base = { businessId: BUSINESS_ID, machineId, slotCode: 'A01', productCatalogue: 'package' as const, priceKes: 350, capacity: 10, position: 1, actor: 'staff-1' };

    await expect(slots.editSlot({ ...base, productId: 'pkg-2' })).rejects.toThrow('still holds 3');
    await expect(slots.editSlot({ ...base, productId: 'pkg-1', capacity: 2 })).rejects.toBeInstanceOf(SlotChangeRefusedError);
    expect((await machineSlotRepository.findBySlotCode(BUSINESS_ID, machineId, 'A01'))?.productId).toBe('pkg-1');

    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 0 });
    const { before, after } = await slots.editSlot({ ...base, productId: 'pkg-2', priceKes: 400 });
    expect(before?.productId).toBe('pkg-1');
    expect(after).toMatchObject({ productId: 'pkg-2', priceKes: 400, currentQuantity: 0 });
  });

  it('keeps every price change — from creation, an edit and a quick price change', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId, slots } = await machineWithSlot(adapter, 0);
    await slots.editSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 380, capacity: 10, position: 1, actor: 'staff-2' });
    await slots.setPrice(BUSINESS_ID, machineId, 'A01', 390, 'staff-3');
    await slots.setPrice(BUSINESS_ID, machineId, 'A01', 390, 'staff-3'); // no change, no line
    const history = await machineSlotRepository.listPriceHistory(BUSINESS_ID, machineId, 'pkg-1');
    expect(history.map((line) => [line.fromKes, line.toKes, line.changedBy])).toEqual([
      [380, 390, 'staff-3'],
      [350, 380, 'staff-2'],
      [null, 350, 'staff-1'],
    ]);
  });
});

describe('copying a slot layout', () => {
  it('copies products, capacity and position but never stock, and refuses a copy that would swap a loaded slot', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId: source, slots } = await machineWithSlot(adapter, 7);
    adapter.seedSlot(source, 'A02', { quantity: 0 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: source, slotCode: 'A02', productId: 'pkg-9', productCatalogue: 'package', priceKes: 200, capacity: 8, position: 2 });
    const { machineId: target } = await machineWithSlot(adapter, 4);
    adapter.seedSlot(target, 'A02', { quantity: 0 }); // the physical slot exists; Snack Quest just hasn't set it up
    // Target A01 holds 4 of pkg-1 — the same product as the source, so that's fine.
    const service = new MachineSlotService(() => adapter);

    await expect(service.copyLayout(BUSINESS_ID, source, target, { includePrices: false, actor: 'staff-1' })).rejects.toThrow('A02 is new here and needs a price');
    const { copied } = await service.copyLayout(BUSINESS_ID, source, target, { includePrices: true, actor: 'staff-1' });
    expect(copied.sort()).toEqual(['A01', 'A02']);
    const after = await machineSlotRepository.listByMachine(BUSINESS_ID, target);
    expect(after.map((slot) => [slot.slotCode, slot.productId, slot.capacity, slot.currentQuantity])).toEqual([
      ['A01', 'pkg-1', 10, 4],
      ['A02', 'pkg-9', 8, 0],
    ]);

    await adminFirestore.collection('machineSlots').doc(`${source}__A01`).update({ productId: 'pkg-other' });
    await expect(service.copyLayout(BUSINESS_ID, source, target, { includePrices: true, actor: 'staff-1' })).rejects.toThrow('A01 still holds 4 of a different product');
    await expect(service.copyLayout(BUSINESS_ID, target, target, { includePrices: true, actor: 'staff-1' })).rejects.toBeInstanceOf(SlotChangeRefusedError);
  });
});

describe('slot quarantine', () => {
  async function paidAndAuthorized(adapter: MockVendingAdapter) {
    const { machineId } = await machineWithSlot(adapter, 3);
    const service = new MachineTransactionService(() => adapter);
    const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await service.markPaymentVerified(BUSINESS_ID, id, `mpesa-${id}`);
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, id);
    return { service, machineId, id, vendRef };
  }

  it.each(['jam', 'unknown', 'sensor_failure'])('a %s pauses the slot, so the next customer can’t pay for it', async (status) => {
    const adapter = new MockVendingAdapter();
    const { service, machineId, id, vendRef } = await paidAndAuthorized(adapter);
    await service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: false, status, failureReason: 'test', idempotencyKey: `r-${vendRef}` }, source: 'mock', actor: 'device' });

    const slot = await machineSlotRepository.findBySlotCode(BUSINESS_ID, machineId, 'A01');
    expect(slot?.enabled).toBe(false);
    expect(slot?.quarantine).toMatchObject({ reason: status, transactionId: id });
    await expect(service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' })).rejects.toBeInstanceOf(SlotUnavailableForSaleError);

    await machineSlotService.releaseQuarantine(BUSINESS_ID, machineId, 'A01');
    const released = await machineSlotRepository.findBySlotCode(BUSINESS_ID, machineId, 'A01');
    expect(released).toMatchObject({ enabled: true, quarantine: null });
    await expect(machineSlotService.releaseQuarantine(BUSINESS_ID, machineId, 'A01')).rejects.toThrow('isn’t paused');
  });

  it('an ordinary failure or a success leaves the slot selling, and slot health counts both', async () => {
    const adapter = new MockVendingAdapter();
    const first = await paidAndAuthorized(adapter);
    await first.service.applyVendResult({ businessId: BUSINESS_ID, machineId: first.machineId, rawPayload: { vendRef: first.vendRef, dispensed: false, status: 'no_product', failureReason: 'empty', idempotencyKey: `r-${first.vendRef}` }, source: 'mock', actor: 'device' });
    expect((await machineSlotRepository.findBySlotCode(BUSINESS_ID, first.machineId, 'A01'))?.enabled).toBe(true);

    const { id } = await first.service.createPending({ businessId: BUSINESS_ID, machineId: first.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await first.service.markPaymentVerified(BUSINESS_ID, id, `mpesa-${id}`);
    const { vendRef } = await first.service.authorizeVend(BUSINESS_ID, id);
    await first.service.applyVendResult({ businessId: BUSINESS_ID, machineId: first.machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `r-${vendRef}` }, source: 'mock', actor: 'device' });

    const health = await machineSlotService.slotHealth(BUSINESS_ID, first.machineId);
    expect(health).toEqual([{ slotCode: 'A01', recent: ['success', 'no_product'], successes: 1, problems: 1 }]);
  });

  it('a second bad vend keeps the first reason', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await machineWithSlot(adapter, 3);
    expect(await machineSlotService.quarantineAfterVend(BUSINESS_ID, machineId, 'A01', 'jam', 'txn-1')).toBe(true);
    expect(await machineSlotService.quarantineAfterVend(BUSINESS_ID, machineId, 'A01', 'unknown', 'txn-2')).toBe(false);
    expect(await machineSlotService.quarantineAfterVend(BUSINESS_ID, machineId, 'A01', 'failed', 'txn-3')).toBe(false);
    expect((await machineSlotRepository.findBySlotCode(BUSINESS_ID, machineId, 'A01'))?.quarantine).toMatchObject({ reason: 'jam', transactionId: 'txn-1' });
  });
});

describe('copying a machine’s range', () => {
  it('adds what the other machine carries, keeps what this one already has, and copies overrides only when asked', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId: source } = await machineWithSlot(adapter, 0);
    const { machineId: target } = await machineWithSlot(adapter, 0);
    const snackA = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'A', imageUrl: null, expectedUnitCostKes: 50, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true }, 'staff-1');
    const snackB = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'B', imageUrl: null, expectedUnitCostKes: 50, unitLabel: 'bag', origin: 'Japan', sourcingNote: null, isActive: true }, 'staff-1');
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: source, productId: snackA, productCatalogue: 'snackItem', category: 'Chips', displayOrder: 3, actor: 'staff-1' });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: source, productId: snackB, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.setPriceOverride(BUSINESS_ID, source, 'snackItem', snackA, 275, 'staff-1');
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: target, productId: snackB, productCatalogue: 'snackItem', category: 'Mine', actor: 'staff-1' });

    expect(await machineAssortmentService.copyRange(BUSINESS_ID, source, target, { includePriceOverrides: false, actor: 'staff-1' })).toEqual({ added: 1, alreadyCarried: 1 });
    const rows = await machineAssortmentService.listByMachine(BUSINESS_ID, target);
    const a = rows.find((row) => row.productId === snackA);
    expect(a).toMatchObject({ assorted: true, category: 'Chips', displayOrder: 3, priceOverrideKes: null, slotCode: null });
    expect(rows.find((row) => row.productId === snackB)?.category).toBe('Mine');

    await machineAssortmentService.unassortProduct(BUSINESS_ID, target, 'snackItem', snackA);
    await machineAssortmentService.copyRange(BUSINESS_ID, source, target, { includePriceOverrides: true, actor: 'staff-1' });
    expect((await machineAssortmentService.listByMachine(BUSINESS_ID, target)).find((row) => row.productId === snackA)?.priceOverrideKes).toBe(275);
  });
});

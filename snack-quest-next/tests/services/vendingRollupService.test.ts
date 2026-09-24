import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineInventoryMovementService } from '@/services/machineInventoryMovementService';
import { MachineTelemetryService } from '@/services/machineTelemetryService';
import { partnerService } from '@/services/partnerService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { networkDailySummaryRepository } from '@/repositories/networkDailySummaryRepository';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

const BUSINESS_ID = 'biz-vending-rollup-test';
// A day well in the past, so it's never treated as "today" and skipped by a range rebuild.
const FIXED_DATE = '2024-01-15';
const fixedNow = new Date(`${FIXED_DATE}T12:00:00.000Z`);

async function seedMachineWithSlot(adapter: MockVendingAdapter, ownerPartnerId: string | null, quantity = 10) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test-model',
    ownerPartnerId,
    actor: 'staff-1',
  });
  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({
    businessId: BUSINESS_ID,
    machineId,
    slotCode: 'A01',
    productId: 'pkg-1',
    productCatalogue: 'package',
    priceKes: 350,
    capacity: 20,
    position: 1,
  });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId };
}

/** Every write in the flow stamps `FieldValue.serverTimestamp()`, so to land it inside `FIXED_DATE` for the rollup we backdate `createdAt` afterward — the same technique other date-window tests in this codebase use rather than fighting the emulator's clock. */
async function dispenseOneSale(adapter: MockVendingAdapter, machineId: string) {
  const transactions = new MachineTransactionService(() => adapter);
  const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
  const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
  await transactions.applyVendResult({
    businessId: BUSINESS_ID,
    machineId,
    rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` },
    source: 'mock',
    actor: 'staff-1',
  });
  await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: fixedNow });
  return id;
}

async function backdateLatestMovement(machineId: string) {
  const snapshot = await adminFirestore
    .collection('machineInventoryMovements')
    .where('machineId', '==', machineId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  await snapshot.docs[0].ref.update({ createdAt: fixedNow });
}

async function ingestFault(machineId: string) {
  const adapter = new MockVendingAdapter();
  const telemetry = new MachineTelemetryService(() => adapter);
  const { eventId } = await telemetry.ingest({
    businessId: BUSINESS_ID,
    machineId,
    rawPayload: { machineId, eventType: 'fault', idempotencyKey: `fault-${Date.now()}-${Math.random()}` },
    source: 'test',
  });
  await adminFirestore.collection('machineTelemetryEvents').doc(eventId).update({ receivedAt: fixedNow });
}

beforeEach(async () => {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineInventoryMovements',
    'machineTelemetryEvents',
    'deviceCredentials',
    'restockTasks',
    'partners',
    'machineDailySummary',
    'partnerDailySummary',
    'networkDailySummary',
    'snackItems',
    'machineAssortments',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('vendingRollupService.computeMachineDay / rebuildMachineDay', () => {
  it('computes gross sales, units and per-product breakdown from real transactions', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);

    await dispenseOneSale(adapter, machineId);
    await dispenseOneSale(adapter, machineId);
    await dispenseOneSale(adapter, machineId);

    const rollup = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);

    expect(rollup.transactionCount).toBe(3);
    expect(rollup.dispensedCount).toBe(3);
    expect(rollup.grossSalesKes).toBe(1050);
    expect(rollup.unitsSold).toBe(3);
    expect(rollup.averageOrderValueKes).toBe(350);
    expect(rollup.byProduct['pkg-1']).toEqual({ unitsSold: 3, grossSalesKes: 1050, cogsKes: 0, grossProfitKes: 1050, category: null });
    expect(rollup.paidVendFailedCount).toBe(0);
    expect(rollup.refundsKes).toBe(0);
    // pkg-1 is a package — packages carry no cost field, so its units count as unpriced rather than a fabricated zero cost.
    expect(rollup.unpricedUnitsSold).toBe(3);
    expect(rollup.stockoutProductIds).toEqual([]);
  });

  it('resolves cost/profit/category for a snackItem sale from the transaction\'s own recorded product, not the slot\'s current config', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-SKU-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test-model',
      actor: 'staff-1',
    });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Korean Spicy Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    adapter.seedSlot(machineId, 'B01', { quantity: 5 });
    const slots = new MachineSlotService(() => adapter);
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'B01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__B01`).update({ currentQuantity: 5 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'B01');

    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'B01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
    await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: fixedNow });

    const rollup = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);
    expect(rollup.byProduct[skuId]).toEqual({ unitsSold: 1, grossSalesKes: 250, cogsKes: 100, grossProfitKes: 150, category: 'Asian Snacks' });
    expect(rollup.unpricedUnitsSold).toBe(0);
  });

  it('snapshots a stocked-out assorted product, but never an assorted product that still has stock', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-STOCKOUT-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test-model',
      actor: 'staff-1',
    });
    const emptySku = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Out Of Stock Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const stockedSku = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Well Stocked Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Japan', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'C01', { quantity: 0 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'C01', productId: emptySku, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__C01`).update({ currentQuantity: 0 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: emptySku, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', emptySku, 'C01');

    adapter.seedSlot(machineId, 'C02', { quantity: 8 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'C02', productId: stockedSku, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 2 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__C02`).update({ currentQuantity: 8 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: stockedSku, productCatalogue: 'snackItem', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', stockedSku, 'C02');

    const rollup = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);
    expect(rollup.stockoutProductIds).toEqual([emptySku]);
  });

  it('counts a paid-but-vend-failed transaction separately from a clean dispense, and never as revenue', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null, 1);
    await adapter.disableSlot(machineId, 'A01'); // next authorizeVend will be refused

    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    await transactions.authorizeVend(BUSINESS_ID, id);
    await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: fixedNow });

    const rollup = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);

    expect(rollup.transactionCount).toBe(1);
    expect(rollup.dispensedCount).toBe(0);
    expect(rollup.paidVendFailedCount).toBe(1);
    expect(rollup.grossSalesKes).toBe(0);
  });

  it('counts restocks and faults from the same day, and excludes ones outside it', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);

    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, actor: 'staff-1' });
    await backdateLatestMovement(machineId);
    // A restock the day after should not be counted in FIXED_DATE's rollup.
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 2, actor: 'staff-1' });

    await ingestFault(machineId);

    const rollup = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);
    expect(rollup.restockCount).toBe(1);
    expect(rollup.faultCount).toBe(1);
    expect(rollup.heartbeatCount).toBe(0);
  });

  it('is idempotent: rebuilding the same day twice produces the same stored rollup', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);
    await dispenseOneSale(adapter, machineId);

    const first = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);
    const second = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, FIXED_DATE);
    expect(second).toEqual(first);

    const stored = await machineDailySummaryRepository.get(BUSINESS_ID, machineId, FIXED_DATE);
    expect(stored?.grossSalesKes).toBe(350);
  });

  it('excludes another machine\'s transactions from this machine\'s rollup', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId: machineA } = await seedMachineWithSlot(adapter, null);
    const { machineId: machineB } = await seedMachineWithSlot(adapter, null);
    await dispenseOneSale(adapter, machineA);
    await dispenseOneSale(adapter, machineB);
    await dispenseOneSale(adapter, machineB);

    const rollupA = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineA, FIXED_DATE);
    const rollupB = await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineB, FIXED_DATE);

    expect(rollupA.transactionCount).toBe(1);
    expect(rollupB.transactionCount).toBe(2);
  });
});

describe('vendingRollupService.rebuildMachineDayRange', () => {
  it('rebuilds every day in a short, fully-completed range', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);
    await dispenseOneSale(adapter, machineId);

    const nextDate = dateKey(new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000));
    const { days } = await vendingRollupService.rebuildMachineDayRange(BUSINESS_ID, machineId, FIXED_DATE, nextDate);

    expect(days).toBe(2);
    const stored = await machineDailySummaryRepository.get(BUSINESS_ID, machineId, FIXED_DATE);
    expect(stored?.grossSalesKes).toBe(350);
    const nextDayStored = await machineDailySummaryRepository.get(BUSINESS_ID, machineId, nextDate);
    expect(nextDayStored?.grossSalesKes).toBe(0);
  });

  it('skips today, even when the requested range includes it', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);

    const today = dateKey(new Date());
    const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const { days } = await vendingRollupService.rebuildMachineDayRange(BUSINESS_ID, machineId, yesterday, today);

    expect(days).toBe(1);
    const todayStored = await machineDailySummaryRepository.get(BUSINESS_ID, machineId, today);
    expect(todayStored).toBeNull();
  });
});

describe('vendingRollupService.computePartnerDay / rebuildPartnerDay', () => {
  it('sums gross sales across every machine the partner owns, in one composed read', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId: machineA } = await seedMachineWithSlot(adapter, partnerId);
    const { machineId: machineB } = await seedMachineWithSlot(adapter, partnerId);
    const { machineId: unrelatedMachine } = await seedMachineWithSlot(adapter, null);

    await dispenseOneSale(adapter, machineA);
    await dispenseOneSale(adapter, machineB);
    await dispenseOneSale(adapter, machineB);
    await dispenseOneSale(adapter, unrelatedMachine);

    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineA, FIXED_DATE);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineB, FIXED_DATE);
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, unrelatedMachine, FIXED_DATE);

    const rollup = await vendingRollupService.rebuildPartnerDay(BUSINESS_ID, partnerId, FIXED_DATE);

    expect(rollup.machineCount).toBe(2);
    expect(rollup.transactionCount).toBe(3);
    expect(rollup.dispensedCount).toBe(3);
    expect(rollup.grossSalesKes).toBe(1050);
  });

  it('self-heals a machine day that was never stored, without persisting it under the machine itself', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, partnerId);
    await dispenseOneSale(adapter, machineId);
    // Deliberately never call rebuildMachineDay for this machine.

    const rollup = await vendingRollupService.computePartnerDay(BUSINESS_ID, partnerId, FIXED_DATE);
    expect(rollup.grossSalesKes).toBe(350);

    const storedMachineRollup = await machineDailySummaryRepository.get(BUSINESS_ID, machineId, FIXED_DATE);
    expect(storedMachineRollup).toBeNull();
  });

  it('reports zero for a partner with no machines', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Empty Partner', actor: 'staff-1' });
    const rollup = await vendingRollupService.rebuildPartnerDay(BUSINESS_ID, partnerId, FIXED_DATE);
    expect(rollup).toEqual({ machineCount: 0, transactionCount: 0, dispensedCount: 0, grossSalesKes: 0, refundsKes: 0, faultCount: 0 });
  });
});

describe('vendingRollupService.computeNetworkDay / rebuildNetworkDay', () => {
  it('sums gross sales, COGS and category mix across every machine in the business, composed from machineDailySummary', async () => {
    const adapter = new MockVendingAdapter();
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Network Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );

    const { machineId: machineA } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-NET-A-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test-model',
      actor: 'staff-1',
    });
    adapter.seedSlot(machineA, 'A01', { quantity: 5 });
    const slots = new MachineSlotService(() => adapter);
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: machineA, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineA}__A01`).update({ currentQuantity: 5 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId: machineA, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineA, 'snackItem', skuId, 'A01');

    const { machineId: machineB } = await seedMachineWithSlot(adapter, null);

    // machine A: one snackItem sale (cost 100, price 250); machine B: one package sale (unpriced).
    const transactionsA = new MachineTransactionService(() => adapter);
    const { id: txA } = await transactionsA.createPending({ businessId: BUSINESS_ID, machineId: machineA, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactionsA.markPaymentVerified(BUSINESS_ID, txA, `mpesa-ref-${txA}`);
    const { vendRef: vendRefA } = await transactionsA.authorizeVend(BUSINESS_ID, txA);
    await transactionsA.applyVendResult({ businessId: BUSINESS_ID, machineId: machineA, rawPayload: { vendRef: vendRefA, dispensed: true, idempotencyKey: `vend-result-${txA}` }, source: 'mock', actor: 'staff-1' });
    await adminFirestore.collection('machineTransactions').doc(txA).update({ createdAt: fixedNow });

    await dispenseOneSale(adapter, machineB);

    const rollup = await vendingRollupService.rebuildNetworkDay(BUSINESS_ID, FIXED_DATE);

    expect(rollup.machineCount).toBe(2);
    expect(rollup.transactionCount).toBe(2);
    expect(rollup.dispensedCount).toBe(2);
    expect(rollup.grossSalesKes).toBe(600); // 250 + 350
    expect(rollup.cogsKes).toBe(100);
    expect(rollup.grossProfitKes).toBe(500);
    expect(rollup.unpricedUnitsSold).toBe(1); // machine B's package sale
    expect(rollup.byCategory['Asian Snacks']).toEqual({ unitsSold: 1, grossSalesKes: 250, cogsKes: 100, grossProfitKes: 150 });
    expect(rollup.byCategory.uncategorized).toEqual({ unitsSold: 1, grossSalesKes: 350, cogsKes: 0, grossProfitKes: 350 });

    const stored = await networkDailySummaryRepository.get(BUSINESS_ID, FIXED_DATE);
    expect(stored?.grossSalesKes).toBe(600);
  });

  it('self-heals a machine day that was never stored, without persisting it under the machine itself', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);
    await dispenseOneSale(adapter, machineId);
    // Deliberately never call rebuildMachineDay for this machine.

    const rollup = await vendingRollupService.computeNetworkDay(BUSINESS_ID, FIXED_DATE);
    expect(rollup.grossSalesKes).toBe(350);

    const storedMachineRollup = await machineDailySummaryRepository.get(BUSINESS_ID, machineId, FIXED_DATE);
    expect(storedMachineRollup).toBeNull();
  });

  it('is idempotent: rebuilding the same network day twice produces the same stored rollup, never double-counted', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, null);
    await dispenseOneSale(adapter, machineId);

    const first = await vendingRollupService.rebuildNetworkDay(BUSINESS_ID, FIXED_DATE);
    const second = await vendingRollupService.rebuildNetworkDay(BUSINESS_ID, FIXED_DATE);
    expect(second).toEqual(first);
    expect(second.grossSalesKes).toBe(350);
  });

  it('reports zero for a business with no machines', async () => {
    const rollup = await vendingRollupService.rebuildNetworkDay(BUSINESS_ID, FIXED_DATE);
    expect(rollup).toEqual({
      machineCount: 0,
      transactionCount: 0,
      dispensedCount: 0,
      grossSalesKes: 0,
      refundsKes: 0,
      unitsSold: 0,
      cogsKes: 0,
      grossProfitKes: 0,
      unpricedUnitsSold: 0,
      faultCount: 0,
      stockoutSnapshotCount: 0,
      byCategory: {},
    });
  });
});

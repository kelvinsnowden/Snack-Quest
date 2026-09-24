import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { partnerService } from '@/services/partnerService';
import { locationService } from '@/services/locationService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { restockTaskService } from '@/services/restockTaskService';
import { withdrawalService } from '@/services/withdrawalService';
import { cameraService } from '@/services/cameraService';
import { ownerPortalService, PartnerDoesNotOwnMachineError, NothingToRestockError, CameraNotFoundError } from '@/services/ownerPortalService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';

/**
 * The Owner Portal's own read model (§ PART 2 — OWNER PORTAL) — proves
 * the two things that actually matter here: the wallet's four buckets
 * (earned/available/pending/withdrawn) add up to something a partner
 * could audit against their own withdrawal history rather than a
 * number they just have to trust, and that per-machine detail
 * (location, last sale, last restock, profit) is assembled correctly
 * from the existing domains without inventing any new financial
 * arithmetic. Cross-partner isolation is the one security property
 * every layer in this fleet re-proves at its own boundary.
 */

const BUSINESS_ID = 'biz-owner-portal-test';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanCollections() {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineAssortments',
    'machineAssortmentPriceHistory',
    'machineDailySummary',
    'machineSettlements',
    'machineSubscriptions',
    'restockTasks',
    'snackItems',
    'deviceCredentials',
    'partners',
    'locations',
    'withdrawals',
    'cameras',
    'cameraSnapshots',
    'alerts',
  ]) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

describe('OwnerPortalService.getDashboard', () => {
  it('sums earned/available/pending/withdrawn from the partner record and its own withdrawal history', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Dashboard Owner', actor: 'staff-1' });
    // Starts at 8000; requesting the two withdrawals below reserves (decrements) 3000 of it, landing at 5000 — exactly what a real partner's own math would show.
    await adminFirestore.collection('partners').doc(partnerId).update({ availableCashKes: 8000, lifetimeEarnedKes: 20000 });

    const pending = await withdrawalService.requestWithdrawal({ businessId: BUSINESS_ID, ownerId: partnerId, ownerType: 'partner', amountKes: 1000, phoneNumber: '254712345678' });
    const paid = await withdrawalService.requestWithdrawal({ businessId: BUSINESS_ID, ownerId: partnerId, ownerType: 'partner', amountKes: 2000, phoneNumber: '254712345678' });
    await adminFirestore.collection('withdrawals').doc(paid).update({ status: 'paid' });
    void pending;

    const dashboard = await ownerPortalService.getDashboard(BUSINESS_ID, partnerId);
    expect(dashboard.wallet.earnedKes).toBe(20000);
    expect(dashboard.wallet.availableKes).toBe(5000);
    expect(dashboard.wallet.pendingKes).toBe(1000);
    expect(dashboard.wallet.withdrawnKes).toBe(2000);
    expect(dashboard.machines).toEqual([]);
  });

  it('never returns another partner\'s machines on the dashboard', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner B', actor: 'staff-1' });
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-DASH-${Date.now()}`, serialNumber: 'SN-1', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerB, actor: 'staff-1' });

    const dashboard = await ownerPortalService.getDashboard(BUSINESS_ID, partnerA);
    expect(dashboard.machines).toEqual([]);
  });
});

describe('OwnerPortalService.getMachineDetail', () => {
  it('assembles location, last sale, last restock, all four performance windows, and lifetime profit from finalized settlements only', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Detail Owner', actor: 'staff-1' });
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Campus Kiosk', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Detail Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-DETAIL-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerId,
      actor: 'staff-1',
    });
    await machineService.relocate(BUSINESS_ID, machineId, { locationId, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');

    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 10 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 250, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
    await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
    await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
    await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${yesterday}T12:00:00.000Z`) });
    await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, yesterday);

    const restockTaskId = await restockTaskService.createDraft({
      businessId: BUSINESS_ID,
      machineId,
      items: [{ slotId: 'A01', productId: skuId, quantityNeeded: 5 }],
      priority: 'normal',
      actor: 'staff-1',
    });

    const draftSettlement = await machineSettlementService.createDraft({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      periodStart: new Date(`${yesterday}T00:00:00.000Z`),
      periodEnd: new Date(`${yesterday}T23:59:59.999Z`),
      actor: 'staff-1',
    });
    await machineSettlementService.finalize(BUSINESS_ID, draftSettlement, 'staff-1');
    const finalized = await machineSettlementService.listByMachine(BUSINESS_ID, machineId);
    const expectedProfitKes = finalized.filter((s) => s.data.status === 'finalized' || s.data.status === 'paid').reduce((sum, s) => sum + s.data.distributableOwnerKes, 0);

    const detail = await ownerPortalService.getMachineDetail(BUSINESS_ID, partnerId, machineId);
    expect(detail.location).toEqual({ id: locationId, name: 'Campus Kiosk', city: 'Nairobi', area: null });
    expect(detail.lastSaleAt).not.toBeNull();
    expect(detail.lastRestock?.taskId).toBe(restockTaskId);
    expect(Object.keys(detail.performanceByWindow).map(Number).sort((a, b) => a - b)).toEqual([1, 7, 30, 90]);
    expect(detail.performanceByWindow[90].revenueKes).toBe(250);
    expect(detail.performanceByWindow[90].transactionCount).toBe(1);
    expect(detail.lifetimeDistributableProfitKes).toBe(expectedProfitKes);
  });

  it('refuses to assemble detail for a machine the partner does not own', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner X', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner Y', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-XDETAIL-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });

    await expect(ownerPortalService.getMachineDetail(BUSINESS_ID, partnerB, machineId)).rejects.toThrow(PartnerDoesNotOwnMachineError);
  });
});

/** Provisions one machine for `partnerId`, configures one slot selling `skuId` at `priceKes`, and records+backdates one dispensed sale on `dateKeyStr`, rebuilding that day's rollup. Returns the machine id so the caller can assert against it. */
async function seedDispensedSale(partnerId: string, skuId: string, dateKeyStr: string, priceKes = 250): Promise<{ machineId: string }> {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-SALE-${partnerId}-${dateKeyStr}-${Math.random().toString(36).slice(2, 8)}`,
    serialNumber: `SN-${Math.random().toString(36).slice(2, 8)}`,
    manufacturer: 'mock',
    model: 'test',
    ownerPartnerId: partnerId,
    actor: 'staff-1',
  });

  const adapter = new MockVendingAdapter();
  const slots = new MachineSlotService(() => adapter);
  adapter.seedSlot(machineId, 'A01', { quantity: 10 });
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes, capacity: 20, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });
  await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', category: 'Asian Snacks', actor: 'staff-1' });
  await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, 'A01');

  const transactions = new MachineTransactionService(() => adapter);
  const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
  const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
  await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });
  await adminFirestore.collection('machineTransactions').doc(id).update({ createdAt: new Date(`${dateKeyStr}T12:00:00.000Z`) });
  await vendingRollupService.rebuildMachineDay(BUSINESS_ID, machineId, dateKeyStr);

  return { machineId };
}

describe('OwnerPortalService.getSalesTrend / getTopProducts', () => {
  it('sums across every machine the partner owns, resolves real product names, zero-fills days with no sale, and never includes another partner\'s machine', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Trend Owner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Trend Owner B', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Trend Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );

    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await seedDispensedSale(partnerA, skuId, yesterday);
    await seedDispensedSale(partnerB, skuId, yesterday);

    const trend = await ownerPortalService.getSalesTrend(BUSINESS_ID, partnerA, 7);
    expect(trend.find((p) => p.date === yesterday)).toEqual({ date: yesterday, revenueKes: 250, unitsSold: 1 });
    expect(trend.filter((p) => p.date !== yesterday).every((p) => p.revenueKes === 0 && p.unitsSold === 0)).toBe(true);

    const topProducts = await ownerPortalService.getTopProducts(BUSINESS_ID, partnerA, 7);
    expect(topProducts).toEqual([{ productId: skuId, name: 'Trend Snack', unitsSold: 1, revenueKes: 250 }]);
  });
});

describe('OwnerPortalService.getRecentActivity', () => {
  it('returns the partner\'s own dispensed sales newest-first and never another partner\'s', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Activity Owner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Activity Owner B', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Activity Snack', imageUrl: null, expectedUnitCostKes: 50, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );

    const twoDaysAgo = dateKey(new Date(Date.now() - 2 * DAY_MS));
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const { machineId: machineA } = await seedDispensedSale(partnerA, skuId, twoDaysAgo);
    await seedDispensedSale(partnerA, skuId, yesterday);
    await seedDispensedSale(partnerB, skuId, yesterday);

    const activity = await ownerPortalService.getRecentActivity(BUSINESS_ID, partnerA, 10);
    expect(activity).toHaveLength(2);
    expect(activity.every((item) => item.machineId === machineA || item.machineCode.startsWith(`SQ-SALE-${partnerA}`))).toBe(true);
    expect(new Date(activity[0].dispensedAt).getTime()).toBeGreaterThanOrEqual(new Date(activity[1].dispensedAt).getTime());
  });
});

describe('OwnerPortalService.getMachineInventory', () => {
  it('classifies every slot status, counts low/out-of-stock, and refuses a non-owner', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Inventory Owner', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Inventory Stranger', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Inventory Snack', imageUrl: null, expectedUnitCostKes: 80, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-INV-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });

    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    for (const slotCode of ['A01', 'A02', 'A03', 'A04']) {
      adapter.seedSlot(machineId, slotCode, { quantity: 0 });
    }
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 100, capacity: 20, position: 1 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A02', productId: skuId, productCatalogue: 'snackItem', priceKes: 100, capacity: 20, position: 2 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A03', productId: skuId, productCatalogue: 'snackItem', priceKes: 100, capacity: 20, position: 3 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A04', productId: null, productCatalogue: 'snackItem', priceKes: 0, capacity: 20, position: 4 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 15 }); // in_stock
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A02`).update({ currentQuantity: 2 }); // low_stock (0.1 <= 0.2)
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A03`).update({ currentQuantity: 0 }); // out_of_stock

    const inventory = await ownerPortalService.getMachineInventory(BUSINESS_ID, partnerA, machineId);
    expect(inventory.counts).toEqual({ all: 4, lowStock: 1, outOfStock: 1 });
    expect(inventory.items.find((i) => i.slotCode === 'A01')?.status).toBe('in_stock');
    expect(inventory.items.find((i) => i.slotCode === 'A02')?.status).toBe('low_stock');
    expect(inventory.items.find((i) => i.slotCode === 'A03')?.status).toBe('out_of_stock');
    expect(inventory.items.find((i) => i.slotCode === 'A04')?.status).toBe('empty_slot');
    expect(inventory.items.find((i) => i.slotCode === 'A01')?.productName).toBe('Inventory Snack');

    await expect(ownerPortalService.getMachineInventory(BUSINESS_ID, partnerB, machineId)).rejects.toThrow(PartnerDoesNotOwnMachineError);
  });
});

describe('OwnerPortalService.requestRestock', () => {
  it('opens a real draft restock task through the same staged workflow when a slot is low or out of stock', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Restock Owner', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Restock Snack', imageUrl: null, expectedUnitCostKes: 80, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-RESTOCK-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerId,
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 0 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 100, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 0 });

    const taskId = await ownerPortalService.requestRestock(BUSINESS_ID, partnerId, machineId, 'partner-uid-1');
    const task = await restockTaskService.findById(BUSINESS_ID, taskId);
    expect(task?.status).toBe('draft');
    expect(task?.machineId).toBe(machineId);
    expect(task?.items.some((item) => item.slotId === 'A01')).toBe(true);
  });

  it('refuses to open an empty restock task when every slot is already well stocked', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Stocked Owner', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Stocked Snack', imageUrl: null, expectedUnitCostKes: 80, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-STOCKED-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerId,
      actor: 'staff-1',
    });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 20 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 100, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 20 });

    await expect(ownerPortalService.requestRestock(BUSINESS_ID, partnerId, machineId, 'partner-uid-1')).rejects.toThrow(NothingToRestockError);
  });

  it('refuses to open a restock task for a machine the partner does not own', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Restock Owner X', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Restock Stranger', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-RESTOCK-X-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });

    await expect(ownerPortalService.requestRestock(BUSINESS_ID, partnerB, machineId, 'partner-uid-1')).rejects.toThrow(PartnerDoesNotOwnMachineError);
  });
});

describe('OwnerPortalService.getDashboardSummary', () => {
  it('returns a null trend percentage (never a fabricated 0% or Infinity%) when the prior window has no data', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Summary Owner A', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Summary Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    await seedDispensedSale(partnerId, skuId, yesterday, 250);

    const summary = await ownerPortalService.getDashboardSummary(BUSINESS_ID, partnerId, 7);
    expect(summary.totalSalesKes).toBe(250);
    expect(summary.totalVends).toBe(1);
    expect(summary.totalSalesTrendPct).toBeNull();
    expect(summary.netEarningsTrendPct).toBeNull();
    expect(summary.totalVendsTrendPct).toBeNull();
    expect(summary.totalMachineCount).toBe(1);
  });

  it('computes a real prior-window comparison once the prior window has data too', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Summary Owner B', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Summary Snack B', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const yesterday = dateKey(new Date(Date.now() - DAY_MS));
    const priorWindowDay = dateKey(new Date(Date.now() - 10 * DAY_MS)); // inside the 7-day window immediately before the current one
    await seedDispensedSale(partnerId, skuId, yesterday, 250);
    await seedDispensedSale(partnerId, skuId, priorWindowDay, 250);

    const summary = await ownerPortalService.getDashboardSummary(BUSINESS_ID, partnerId, 7);
    expect(summary.totalSalesKes).toBe(250);
    expect(summary.totalSalesTrendPct).toBe(0);
  });
});

describe('OwnerPortalService.getMachineHealth', () => {
  it('derives controllerOnline/networkOk from the one real connectivity signal and refuses a non-owner', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Health Owner', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Health Stranger', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-HEALTH-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });
    await adminFirestore.collection('machines').doc(machineId).update({ lastSeenAt: Timestamp.fromDate(new Date()) });

    const health = await ownerPortalService.getMachineHealth(BUSINESS_ID, partnerA, machineId);
    expect(health.connectivity).toBe('online');
    expect(health.controllerOnline).toBe(true);
    expect(health.networkOk).toBe(true);
    expect(health.cameraStatus).toBe('none');

    await expect(ownerPortalService.getMachineHealth(BUSINESS_ID, partnerB, machineId)).rejects.toThrow(PartnerDoesNotOwnMachineError);
  });
});

describe('OwnerPortalService.getAlerts', () => {
  it('only ever surfaces alerts for machines this partner owns', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Alert Owner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Alert Owner B', actor: 'staff-1' });
    const { machineId: machineA } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-ALERT-A-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });
    const { machineId: machineB } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-ALERT-B-${Date.now()}`,
      serialNumber: 'SN-2',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerB,
      actor: 'staff-1',
    });
    const longOffline = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));
    await adminFirestore.collection('machines').doc(machineA).update({ status: 'active', lastSeenAt: longOffline });
    await adminFirestore.collection('machines').doc(machineB).update({ status: 'active', lastSeenAt: longOffline });

    const alertsForA = await ownerPortalService.getAlerts(BUSINESS_ID, partnerA);
    expect(alertsForA.length).toBeGreaterThan(0);
    expect(alertsForA.every((alert) => alert.machineId === machineA)).toBe(true);
    expect(alertsForA.some((alert) => alert.machineId === machineB)).toBe(false);
  });
});

describe('OwnerPortalService camera-for-owner methods', () => {
  it('scopes every camera call through the camera\'s own machine ownership', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Camera Owner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Camera Owner B', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-CAM-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });
    const cameraId = await cameraService.registerCamera(BUSINESS_ID, { machineId, type: 'mock', manufacturer: null, model: null, serialNumber: null, label: 'Dispense area' }, 'staff-1');

    const cameras = await ownerPortalService.listCamerasForMachine(BUSINESS_ID, partnerA, machineId);
    expect(cameras.map(({ id }) => id)).toContain(cameraId);

    await expect(ownerPortalService.listCamerasForMachine(BUSINESS_ID, partnerB, machineId)).rejects.toThrow(PartnerDoesNotOwnMachineError);
    await expect(ownerPortalService.getCameraDiagnosticsForOwner(BUSINESS_ID, partnerB, cameraId)).rejects.toThrow(PartnerDoesNotOwnMachineError);
    await expect(ownerPortalService.getCameraDiagnosticsForOwner(BUSINESS_ID, partnerA, 'does-not-exist')).rejects.toThrow(CameraNotFoundError);

    const { diagnostics } = await ownerPortalService.getCameraDiagnosticsForOwner(BUSINESS_ID, partnerA, cameraId);
    expect(diagnostics.registered).toBe(true);
  });
});

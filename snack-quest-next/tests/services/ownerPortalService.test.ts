import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { ownerPortalService, PartnerDoesNotOwnMachineError } from '@/services/ownerPortalService';
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

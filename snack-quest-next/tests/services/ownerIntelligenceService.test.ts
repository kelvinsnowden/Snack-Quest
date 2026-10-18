import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { partnerService } from '@/services/partnerService';
import { ownerIntelligenceService, PartnerDoesNotOwnMachineError } from '@/services/ownerIntelligenceService';
import { recommendationEngineService } from '@/services/recommendationEngineService';
import { vendingRollupService } from '@/services/vendingRollupService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dateKey } from '@/lib/analytics/dateKey';
import { machineAssortmentIntelligenceService } from '@/services/machineAssortmentIntelligenceService';
import { machineRepository } from '@/repositories/machineRepository';
import { machineDailySummaryDocId } from '@/types/machineDailySummary';

const BUSINESS_ID = 'biz-owner-intel-test';
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanCollections() {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineAssortments',
    'machineAssortmentPriceHistory',
    'machineDailySummary',
    'snackItems',
    'deviceCredentials',
    'intelligenceRecommendations',
    'partners',
  ]) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

describe('OwnerIntelligenceService.getMachineOwnerSummary', () => {
  it('returns revenue/units/category/product/stock health/uptime for the owner\'s own machine, and never leaks PRODUCT_OPPORTUNITY recommendations', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner Partner', actor: 'staff-1' });
    const skuId = await snackItemRepository.create(
      { businessId: BUSINESS_ID, name: 'Owner Summary Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
      'staff-1',
    );
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-OWNER-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerId,
      actor: 'staff-1',
    });
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

    await recommendationEngineService.generateProductOpportunityRecommendations(BUSINESS_ID, 'staff-1');

    const summary = await ownerIntelligenceService.getMachineOwnerSummary(BUSINESS_ID, partnerId, machineId, 7);
    expect(summary.revenueKes).toBe(250);
    expect(summary.unitsSold).toBe(1);
    expect(summary.topCategory).toBe('Asian Snacks');
    expect(summary.topProductId).toBe(skuId);
    expect(summary.stockHealth.assortmentCount).toBe(1);
    expect(summary.recommendations.every((r) => r.type !== 'PRODUCT_OPPORTUNITY')).toBe(true);
  });

  it('throws PartnerDoesNotOwnMachineError for a machine the partner does not own', async () => {
    const partnerA = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner A', actor: 'staff-1' });
    const partnerB = await partnerService.create({ businessId: BUSINESS_ID, name: 'Partner B', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-XOWN-${Date.now()}`,
      serialNumber: 'SN-1',
      manufacturer: 'mock',
      model: 'test',
      ownerPartnerId: partnerA,
      actor: 'staff-1',
    });

    await expect(ownerIntelligenceService.getMachineOwnerSummary(BUSINESS_ID, partnerB, machineId, 7)).rejects.toThrow(PartnerDoesNotOwnMachineError);
  });
});

describe('OwnerIntelligenceService.summarizeOwnedMachine', () => {
  it('gives every window the same answer one call per window would, and stock health matches the full catalog classification', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Windows Owner', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-WIN-${Date.now()}`, serialNumber: 'SN-W', manufacturer: 'mock', model: 'test', ownerPartnerId: partnerId, actor: 'staff-1' });
    await adminFirestore.collection('machines').doc(machineId).update({ status: 'active' });
    const adapter = new MockVendingAdapter();
    const slots = new MachineSlotService(() => adapter);
    const products: string[] = [];
    for (const [index, quantity] of [10, 0, 4].entries()) {
      const skuId = await snackItemRepository.create({ businessId: BUSINESS_ID, name: `Window Snack ${index}`, imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true }, 'staff-1');
      products.push(skuId);
      const slotCode = `A0${index + 1}`;
      adapter.seedSlot(machineId, slotCode, { quantity });
      await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode, productId: skuId, productCatalogue: 'snackItem', priceKes: 200, capacity: 20, position: index + 1 });
      await adminFirestore.collection('machineSlots').doc(`${machineId}__${slotCode}`).update({ currentQuantity: quantity, enabled: index !== 2 });
      await machineAssortmentService.assortProduct({ businessId: BUSINESS_ID, machineId, productId: skuId, productCatalogue: 'snackItem', category: index === 0 ? 'Chips' : 'Drinks', actor: 'staff-1' });
      await machineAssortmentService.linkSlot(BUSINESS_ID, machineId, 'snackItem', skuId, slotCode);
    }
    for (const daysAgo of [1, 5, 20, 60]) {
      const date = dateKey(new Date(Date.now() - daysAgo * DAY_MS));
      await adminFirestore.collection('machineDailySummary').doc(machineDailySummaryDocId(machineId, date)).set({
        businessId: BUSINESS_ID, machineId, date, transactionCount: daysAgo, dispensedCount: daysAgo, paidVendFailedCount: 0, grossSalesKes: daysAgo * 200, refundsKes: 0, unitsSold: daysAgo,
        averageOrderValueKes: 200, byProduct: { [products[daysAgo % 2]]: { unitsSold: daysAgo, grossSalesKes: daysAgo * 200, cogsKes: 0, grossProfitKes: daysAgo * 200, category: daysAgo % 2 ? 'Drinks' : 'Chips' } },
        unpricedUnitsSold: 0, stockoutProductIds: [], heartbeatCount: 10, faultCount: daysAgo === 5 ? 1 : 0,
      });
    }

    const machine = await machineRepository.findById(BUSINESS_ID, machineId);
    const together = await ownerIntelligenceService.summarizeOwnedMachine(BUSINESS_ID, { id: machineId, data: machine! }, [1, 7, 30, 90]);
    const oneByOne = await Promise.all([1, 7, 30, 90].map((days) => ownerIntelligenceService.getMachineOwnerSummary(BUSINESS_ID, partnerId, machineId, days)));
    expect(together).toEqual(oneByOne);
    expect(together.map((summary) => summary.revenueKes)).toEqual([200, 1200, 5200, 17200]);

    const layers = await machineAssortmentIntelligenceService.classifyMachineCatalogLayers(BUSINESS_ID, machineId);
    expect(together[0].stockHealth).toEqual({ assortmentCount: layers.assortmentCount, stockedCount: layers.stockedCount, sellableCount: layers.sellableCount });
    expect(together[0].stockHealth).toEqual({ assortmentCount: 3, stockedCount: 2, sellableCount: 1 });
  });
});

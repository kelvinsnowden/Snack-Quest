import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { priceBookService } from '@/services/priceBookService';
import { reconciliationChecksService } from '@/services/reconciliationChecksService';

/** § RECONCILIATION CHECKS — each check passes on clean records and catches the disagreement it exists for. */

const BUSINESS_ID = 'biz-recon-checks';
const NOW = new Date('2026-10-02T09:00:00Z');
const COLLECTIONS = ['snackItems', 'productPrices', 'productPriceCurrent', 'ownerWholesaleSales', 'stockTransfers', 'machineSettlements', 'adDailyStats', 'adRevenueEntries', 'kioskDeviceStates', 'machines', 'machineTransactions'];

beforeEach(async () => {
  for (const collection of COLLECTIONS) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

const byKey = async () => new Map((await reconciliationChecksService.run(BUSINESS_ID, NOW)).map((check) => [check.key, check]));

describe('reconciliation checks', () => {
  it('everything passes on empty records', async () => {
    const checks = await byKey();
    expect([...checks.values()].every((check) => check.status === 'ok')).toBe(true);
    expect(checks.size).toBe(7);
  });

  it('a current price edited outside the price book fails the price check', async () => {
    const snackId = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'Pocky', imageUrl: null, expectedUnitCostKes: 180, unitLabel: 'box', origin: null, sourcingNote: null, isActive: true }, 'staff');
    await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: snackId, priceType: 'owner_wholesale', amountKes: 250, reason: 'list', actor: 'staff' });
    expect((await byKey()).get('price_projection')?.status).toBe('ok');
    await adminFirestore.collection('productPriceCurrent').doc(`${BUSINESS_ID}__snackItem__${snackId}`).update({ 'prices.owner_wholesale.amountKes': 1 });
    expect((await byKey()).get('price_projection')).toMatchObject({ status: 'fail', count: 1 });
  });

  it('an owner billed for more units than were delivered fails', async () => {
    await adminFirestore.collection('ownerWholesaleSales').add({ businessId: BUSINESS_ID, restockTaskId: 't1', lines: [{ quantity: 5 }], createdAt: Timestamp.fromDate(NOW) });
    await adminFirestore.collection('stockTransfers').add({ businessId: BUSINESS_ID, reason: 'wholesale_to_owner', restockTaskId: 't1', quantity: 4, createdAt: Timestamp.fromDate(NOW) });
    expect((await byKey()).get('wholesale_vs_transfers')).toMatchObject({ status: 'fail', count: 1 });
  });

  it('flags snacks without a cost, settlements on estimated costs, unworked ad revenue and silent screens', async () => {
    await adminFirestore.collection('snackItems').add({ businessId: BUSINESS_ID, name: 'New', costPending: true });
    await adminFirestore.collection('machineSettlements').add({ businessId: BUSINESS_ID, status: 'finalized', estimatedCostSaleCount: 3 });
    await adminFirestore.collection('adDailyStats').add({ businessId: BUSINESS_ID, date: '2026-09-15', campaignId: 'c1', machineId: 'm1', completed: 12 });
    const machine = await adminFirestore.collection('machines').add({ businessId: BUSINESS_ID, status: 'active' });
    await adminFirestore.collection('kioskDeviceStates').doc(machine.id).set({ businessId: BUSINESS_ID, machineId: machine.id, reportedAt: Timestamp.fromMillis(NOW.getTime() - 3 * 3600_000) });
    const checks = await byKey();
    expect(checks.get('products_without_cost')).toMatchObject({ status: 'warn', count: 1 });
    expect(checks.get('settlements_estimated_costs')).toMatchObject({ status: 'warn', count: 1 });
    expect(checks.get('ad_revenue_not_computed')).toMatchObject({ status: 'warn', count: 1 });
    expect(checks.get('screens_not_reporting')).toMatchObject({ status: 'warn', count: 1 });
    await adminFirestore.collection('adRevenueEntries').add({ businessId: BUSINESS_ID, month: '2026-09', campaignId: 'c1' });
    expect((await byKey()).get('ad_revenue_not_computed')?.status).toBe('ok');
  });

  it('a recent sale without frozen costs is a warning, not a failure', async () => {
    await adminFirestore.collection('machineTransactions').add({ businessId: BUSINESS_ID, status: 'dispensed', createdAt: Timestamp.fromMillis(NOW.getTime() - 86_400_000) });
    expect((await byKey()).get('sales_without_snapshot')).toMatchObject({ status: 'warn', count: 1 });
  });
});

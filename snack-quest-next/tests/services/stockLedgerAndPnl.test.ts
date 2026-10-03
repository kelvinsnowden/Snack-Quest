import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { restockTaskService } from '@/services/restockTaskService';
import { machineInventoryMovementService, InsufficientMachineStockError } from '@/services/machineInventoryMovementService';
import { priceBookService } from '@/services/priceBookService';
import { partnerService } from '@/services/partnerService';
import { machinePnlService } from '@/services/machinePnlService';
import { ownerProfitabilityService } from '@/services/ownerProfitabilityService';
import { stockTransferRepository } from '@/repositories/stockTransferRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { resolvePeriod, previousPeriod, nairobiDateKey } from '@/lib/finance/periods';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * The inventory transfer ledger (§ INVENTORY TRANSFER LEDGER, § OWNER
 * INVENTORY COST), typed stock removal, the machine P&L and the owner's
 * profitability report — all on the brief's numbers: landed 180, owner 250,
 * retail 350.
 */

const BUSINESS_ID = 'biz-stock-ledger';
const COLLECTIONS = ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'machineAssortments', 'partners', 'partnerMachineAgreements', 'machineOwnershipHistory', 'productPrices', 'productPriceCurrent', 'snackItems', 'deviceCredentials', 'restockTasks', 'stockTransfers', 'ownerWholesaleSales', 'machineSettlements', 'machineDispenseCommands', 'machineEvents', 'machineTelemetryEvents'];

beforeEach(async () => {
  for (const collection of COLLECTIONS) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

async function setUp(options: { owner?: boolean; ownerStocked?: boolean } = {}) {
  const snackId = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'Pocky', imageUrl: null, expectedUnitCostKes: 180, unitLabel: 'box', origin: 'Japan', sourcingNote: null, isActive: true }, 'staff-1');
  await priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId: snackId, priceType: 'owner_wholesale', amountKes: 250, reason: 'owner price list', actor: 'staff-1' });
  const partnerId = options.owner ? await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' }) : null;
  const adapter = new MockVendingAdapter();
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-LEDGER-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: partnerId, actor: 'staff-1' });
  for (const status of ['installing', 'testing', 'active'] as const) await machineService.updateStatus(BUSINESS_ID, machineId, status, 'staff-1');
  // The mock machine's own stock: enough to vend. The platform's slot count starts at 0 and comes from restocks.
  adapter.seedSlot(machineId, 'A01', { quantity: 20 });
  await new MachineSlotService(() => adapter).configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: snackId, productCatalogue: 'snackItem', priceKes: 350, capacity: 20, position: 1 });
  if (partnerId) {
    await partnerService.createAgreement({ businessId: BUSINESS_ID, partnerId, machineId, status: 'active', revenueSharePartnerPct: null, operatingCostNote: null, effectiveFrom: null, documentRef: null, note: null, terms: { ownerCostBasis: 'wholesale_price', inventoryOwner: options.ownerStocked ? 'machine_owner' : 'snack_quest' }, actor: 'staff-1' });
  }
  return { snackId, partnerId, machineId, adapter };
}

async function restock(machineId: string, dispatched: number, received: number) {
  const taskId = await restockTaskService.createDraft({ businessId: BUSINESS_ID, machineId, items: [{ slotId: 'A01', productId: null, quantityNeeded: dispatched }], actor: 'staff-1' });
  await restockTaskService.approve(BUSINESS_ID, taskId, 'staff-1');
  await restockTaskService.startPicking(BUSINESS_ID, taskId, 'staff-1');
  await restockTaskService.dispatch(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityDispatched: dispatched }]);
  await restockTaskService.markInTransit(BUSINESS_ID, taskId, 'staff-1');
  const result = await restockTaskService.receive(BUSINESS_ID, taskId, 'staff-1', [{ slotId: 'A01', quantityReceived: received }], received < dispatched ? 'two boxes crushed' : null);
  return { taskId, ...result };
}

async function sell(machineId: string, adapter: MockVendingAdapter, count: number) {
  const transactions = new MachineTransactionService(() => adapter);
  for (let index = 0; index < count; index += 1) {
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `r-${id}` }, source: 'mock', actor: 'device' });
  }
}

describe('transfer ledger', () => {
  it('a Snack Quest restock: warehouse → transit → machine, shortfall lost, always Snack Quest’s at landed cost', async () => {
    const { machineId } = await setUp();
    const { taskId, status, ownerWholesaleSaleId } = await restock(machineId, 10, 8);
    expect(status).toBe('partially_received');
    expect(ownerWholesaleSaleId).toBeNull();
    const transfers = (await stockTransferRepository.listByRestockTask(BUSINESS_ID, taskId)).map(({ data }) => data);
    expect(transfers.map((entry) => [entry.reason, entry.from.kind, entry.to.kind, entry.quantity, entry.ownership, entry.unitCostBasisKes]).sort()).toEqual([
      ['restock_dispatch', 'warehouse', 'transit', 10, 'snack_quest', 180],
      ['restock_receive', 'transit', 'machine', 8, 'snack_quest', 180],
      ['restock_shortfall', 'transit', 'lost', 2, 'snack_quest', 180],
    ].sort());
  });

  it('an owner-stocked machine: received stock becomes the owner’s at 250, recorded once as a wholesale sale', async () => {
    const { machineId, partnerId } = await setUp({ owner: true, ownerStocked: true });
    const { ownerWholesaleSaleId } = await restock(machineId, 10, 10);
    expect(ownerWholesaleSaleId).not.toBeNull();
    const sales = await stockTransferRepository.listWholesaleSalesByPartner(BUSINESS_ID, partnerId!);
    expect(sales).toHaveLength(1);
    expect(sales[0].data).toMatchObject({ totalWholesaleKes: 2500, totalLandedKes: 1800, unpricedUnits: 0, machineId });
    const receipt = (await stockTransferRepository.listByMachine(BUSINESS_ID, machineId)).find(({ data }) => data.reason === 'wholesale_to_owner');
    expect(receipt?.data).toMatchObject({ ownership: 'machine_owner', ownerPartnerId: partnerId, unitCostBasisKes: 250, quantity: 10 });
  });

  it('removing expired stock: slot down, one ledger entry to waste, refused beyond what the slot holds', async () => {
    const { machineId } = await setUp();
    await restock(machineId, 5, 5);
    const remove = (quantity: number) =>
      machineInventoryMovementService.removeStock({ businessId: BUSINESS_ID, machineId, slotId: 'A01', quantity, reason: 'expired', note: 'past best-before', actor: 'staff-1', ownership: { owner: 'snack_quest', partnerId: null, unitCostBasisKes: 180 } });
    expect((await remove(2)).afterQuantity).toBe(3);
    await expect(remove(9)).rejects.toBeInstanceOf(InsufficientMachineStockError);
    const removal = (await stockTransferRepository.listByMachine(BUSINESS_ID, machineId)).filter(({ data }) => data.reason === 'removed_expired');
    expect(removal).toHaveLength(1);
    expect(removal[0].data).toMatchObject({ quantity: 2, to: { kind: 'waste' } });
    expect((await machineInventoryMovementService.reconcile(BUSINESS_ID, machineId, 'A01')).matches).toBe(true);
  });
});

describe('machine P&L and owner profitability', () => {
  it('Snack Quest machine: 3 sales at 350, landed 180 → gross profit 510, margin 48.6%; fees reported missing, never zero', async () => {
    const { machineId, adapter } = await setUp();
    await restock(machineId, 5, 5);
    await sell(machineId, adapter, 3);
    const period = resolvePeriod({ preset: 'today' });
    const pnl = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: period.start, periodEnd: period.end, perspective: 'snack_quest' });
    expect(pnl.product).toMatchObject({ units: 3, netRevenueKes: 1050, cogsKes: 540, grossProfitKes: 510, grossMarginPct: 48.6 });
    expect(pnl.contribution.missing).toContain('payment_fees');
    expect(pnl.snackQuestIncome).toBeNull();
  });

  it('owner machine on wholesale terms: owner sees 350 − 250 = 100 per sale (28.6%); Snack Quest earns 70 per unit', async () => {
    const { machineId, adapter, partnerId } = await setUp({ owner: true });
    await restock(machineId, 5, 5);
    await sell(machineId, adapter, 2);
    const period = resolvePeriod({ preset: 'today' });
    const ownerView = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: period.start, periodEnd: period.end, perspective: 'owner' });
    expect(ownerView.product).toMatchObject({ cogsKes: 500, grossProfitKes: 200, grossMarginPct: 28.6 });
    const companyView = await machinePnlService.forMachine({ businessId: BUSINESS_ID, machineId, periodStart: period.start, periodEnd: period.end, perspective: 'snack_quest' });
    expect(companyView.snackQuestIncome).toMatchObject({ wholesaleMarginKes: 140 });

    const report = await ownerProfitabilityService.report(BUSINESS_ID, partnerId!, period);
    expect(report.totals).toMatchObject({ units: 2, netRevenueKes: 700, cogsKes: 500, grossProfitKes: 200, grossMarginPct: 28.6, averageTransactionKes: 350 });
    expect(report.sales[0]).toMatchObject({ sellingPriceKes: 350, yourCostKes: 250, grossProfitKes: 100, grossMarginPct: 28.6 });
    // Snack Quest's landed cost (180) appears nowhere in the owner's report.
    expect(JSON.stringify(report)).not.toContain('180');
  });

  it('an owner’s report never includes another owner’s machine, even when asked for it by id', async () => {
    const mine = await setUp({ owner: true });
    const theirs = await setUp({ owner: true });
    await restock(theirs.machineId, 5, 5);
    await sell(theirs.machineId, theirs.adapter, 1);
    const report = await ownerProfitabilityService.report(BUSINESS_ID, mine.partnerId!, resolvePeriod({ preset: 'today' }), { machineId: theirs.machineId });
    expect(report.totals.units).toBe(0);
    expect(report.byMachine).toHaveLength(0);
  });
});

describe('reporting periods (Nairobi time)', () => {
  const now = new Date('2026-09-30T21:30:00Z'); // 00:30 on 1 October in Nairobi
  it('today is the Nairobi date, not the UTC one', () => {
    expect(resolvePeriod({ preset: 'today' }, now)).toMatchObject({ fromKey: '2026-10-01', toKey: '2026-10-01', days: 1 });
    expect(nairobiDateKey(now)).toBe('2026-10-01');
  });
  it('last month, this month, 7 and 30 days', () => {
    expect(resolvePeriod({ preset: 'last_month' }, now)).toMatchObject({ fromKey: '2026-09-01', toKey: '2026-09-30', days: 30 });
    expect(resolvePeriod({ preset: 'this_month' }, now)).toMatchObject({ fromKey: '2026-10-01', toKey: '2026-10-01' });
    expect(resolvePeriod({ preset: '7d' }, now)).toMatchObject({ fromKey: '2026-09-25', days: 7 });
    expect(resolvePeriod({ preset: '30d' }, now).days).toBe(30);
  });
  it('a custom range must be valid and in order, otherwise 30 days', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-10' }, now)).toMatchObject({ preset: 'custom', days: 10 });
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-10', to: '2026-09-01' }, now).preset).toBe('30d');
    expect(resolvePeriod({ preset: 'custom', from: 'nope', to: '2026-09-01' }, now).preset).toBe('30d');
  });
  it('the previous period is the same length, just before', () => {
    expect(previousPeriod(resolvePeriod({ preset: '7d' }, now))).toMatchObject({ fromKey: '2026-09-18', toKey: '2026-09-24', days: 7 });
  });
});

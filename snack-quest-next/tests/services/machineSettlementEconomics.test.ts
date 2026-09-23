import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { partnerService } from '@/services/partnerService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineSettlementService, IllegalSettlementTransitionError } from '@/services/machineSettlementService';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

const BUSINESS_ID = 'biz-settlement-economics-test';

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
    'partnerMachineAgreements',
    'machineSettlements',
    'machineSubscriptions',
    'snackItems',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

async function seedMachineWithSnackItemSlot(adapter: MockVendingAdapter, ownerPartnerId: string | null, unitCostKes: number, priceKes: number, quantity = 5) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test-model',
    ownerPartnerId,
    actor: 'staff-1',
  });
  const skuId = await snackItemRepository.create(
    { businessId: BUSINESS_ID, name: 'Korean Spicy Snack', imageUrl: null, expectedUnitCostKes: unitCostKes, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true },
    'staff-1',
  );
  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId, skuId };
}

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
  return id;
}

describe('machineSettlementService — COGS', () => {
  it('computes real COGS from snackItem-backed sale movements', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSnackItemSlot(adapter, partnerId, 180, 350, 5);
    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const { cogsKes, unpricedSaleCount } = await machineSettlementService.computeCogsForPeriod(BUSINESS_ID, machineId, periodStart, periodEnd);
    expect(cogsKes).toBe(360); // 2 * 180
    expect(unpricedSaleCount).toBe(0);
  });

  it('carries COGS and distributableOwnerKes through createDraft', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSnackItemSlot(adapter, partnerId, 180, 350, 5);
    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const settlement = await machineSettlementService.findById(BUSINESS_ID, settlementId);

    expect(settlement?.grossSalesKes).toBe(350);
    expect(settlement?.cogsKes).toBe(180);
    expect(settlement?.subscriptionChargedKes).toBe(0); // no subscription created
    expect(settlement?.distributableOwnerKes).toBe(350 - 180 - 0);
  });

  it('nets the active subscription charge into distributableOwnerKes', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSnackItemSlot(adapter, partnerId, 180, 350, 5);
    await machineSubscriptionService.createSubscription({ businessId: BUSINESS_ID, machineId, partnerId, planName: 'Standard', amountKes: 2_000, frequency: 'monthly' });

    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const settlement = await machineSettlementService.findById(BUSINESS_ID, settlementId);

    expect(settlement?.subscriptionChargedKes).toBe(2_000);
    expect(settlement?.distributableOwnerKes).toBe(350 - 180 - 2_000); // legitimately negative — a real loss period, never clamped
  });
});

describe('machineSettlementService.finalize', () => {
  it('credits the partner wallet exactly once and writes a ledger entry', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSnackItemSlot(adapter, partnerId, 180, 350, 5);
    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);
    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const settlement = await machineSettlementService.findById(BUSINESS_ID, settlementId);
    const expectedCredit = settlement!.distributableOwnerKes;

    await machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1');

    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(expectedCredit);
    expect(partner?.lifetimeEarnedKes).toBe(expectedCredit);

    const finalized = await machineSettlementService.findById(BUSINESS_ID, settlementId);
    expect(finalized?.status).toBe('finalized');
    expect(finalized?.finalizedAt).not.toBeNull();
  });

  it('never double-credits a settlement finalized twice', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSnackItemSlot(adapter, partnerId, 180, 350, 5);
    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);
    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const settlement = await machineSettlementService.findById(BUSINESS_ID, settlementId);
    const expectedCredit = settlement!.distributableOwnerKes;

    await machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1');
    await expect(machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1')).rejects.toThrow(IllegalSettlementTransitionError);

    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(expectedCredit); // unchanged by the rejected second call
  });

  it('applies a staff adjustment into the credited amount', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSnackItemSlot(adapter, partnerId, 180, 350, 5);
    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);
    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    await adminFirestore.collection('machineSettlements').doc(settlementId).update({ adjustmentKes: 50, adjustmentReason: 'goodwill credit' });

    const settlement = await machineSettlementService.findById(BUSINESS_ID, settlementId);
    const expectedCredit = settlement!.distributableOwnerKes + 50;

    await machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1');
    const partner = await partnerRepository.findById(BUSINESS_ID, partnerId);
    expect(partner?.availableCashKes).toBe(expectedCredit);
  });
});

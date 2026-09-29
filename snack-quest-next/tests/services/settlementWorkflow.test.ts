import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { partnerService } from '@/services/partnerService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineSettlementService, SettlementChangeRefusedError } from '@/services/machineSettlementService';
import { machineSettlementRepository } from '@/repositories/machineSettlementRepository';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * The settlement screen's steps: a preview that saves nothing and
 * matches what a draft stores, adjustments and discards only on drafts,
 * and a finalize that refuses when the draft has changed since it was
 * reviewed or still has conflicting sales in it.
 */

const BUSINESS_ID = 'biz-settlement-workflow-test';

async function clean() {
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'machineTelemetryEvents', 'machineDispenseCommands', 'machineEvents', 'deviceCredentials', 'restockTasks', 'partners', 'partnerMachineAgreements', 'machineSettlements', 'machineSubscriptions', 'snackItems', 'machineOwnershipHistory']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}
beforeEach(clean);
afterEach(clean);

async function ownedMachineWithOneSale() {
  const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
  const adapter = new MockVendingAdapter();
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-SET-${Math.random().toString(36).slice(2, 9)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId: partnerId, actor: 'staff-1' });
  const skuId = await snackItemRepository.create({ businessId: BUSINESS_ID, name: 'Snack', imageUrl: null, expectedUnitCostKes: 100, unitLabel: 'bag', origin: 'Korea', sourcingNote: null, isActive: true }, 'staff-1');
  adapter.seedSlot(machineId, 'A01', { quantity: 5 });
  await new MachineSlotService(() => adapter).configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: skuId, productCatalogue: 'snackItem', priceKes: 300, capacity: 10, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
  const periodStart = new Date(Date.now() - 60_000);
  const transactions = new MachineTransactionService(() => adapter);
  const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-${id}`);
  const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
  await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `r-${id}` }, source: 'mock', actor: 'device' });
  const periodEnd = new Date(Date.now() + 60_000);
  return { partnerId, machineId, periodStart, periodEnd, transactionId: id };
}

describe('settlement workflow', () => {
  it('previews exactly what a draft would store, without saving anything', async () => {
    const { partnerId, machineId, periodStart, periodEnd } = await ownedMachineWithOneSale();
    const { draft, overlapsSettlementId } = await machineSettlementService.previewDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd });
    expect(overlapsSettlementId).toBeNull();
    expect(draft).toMatchObject({ grossSalesKes: 300, cogsKes: 100, distributableOwnerKes: 200 });
    expect(await machineSettlementRepository.listByMachine(BUSINESS_ID, machineId)).toHaveLength(0);

    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const stored = await machineSettlementService.findById(BUSINESS_ID, settlementId);
    expect(stored).toMatchObject({ grossSalesKes: draft.grossSalesKes, cogsKes: draft.cogsKes, subscriptionChargedKes: draft.subscriptionChargedKes, distributableOwnerKes: draft.distributableOwnerKes });
    expect((await machineSettlementService.previewDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd })).overlapsSettlementId).toBe(settlementId);
  });

  it('adjusts only a draft, needs a reason, and credits the adjusted amount once', async () => {
    const { partnerId, machineId, periodStart, periodEnd } = await ownedMachineWithOneSale();
    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });

    await expect(machineSettlementService.setAdjustment(BUSINESS_ID, settlementId, -50, ' ', 'staff-1')).rejects.toThrow('Say why');
    await expect(machineSettlementService.setAdjustment(BUSINESS_ID, settlementId, 10.5, 'x', 'staff-1')).rejects.toBeInstanceOf(SettlementChangeRefusedError);
    expect(await machineSettlementService.setAdjustment(BUSINESS_ID, settlementId, -50, 'Damaged stock', 'staff-1')).toEqual({ before: 0, after: -50 });

    // The amount confirmed on screen must be the amount credited.
    await expect(machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1', 200)).rejects.toThrow('now credits KES 150');
    await machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1', 150);
    expect((await partnerRepository.findById(BUSINESS_ID, partnerId))?.availableCashKes).toBe(150);

    await expect(machineSettlementService.setAdjustment(BUSINESS_ID, settlementId, 0, '', 'staff-1')).rejects.toThrow('Only a draft');
    await expect(machineSettlementService.discardDraft(BUSINESS_ID, settlementId)).rejects.toThrow('finalized');
  });

  it('discards a draft so the period can be prepared again', async () => {
    const { partnerId, machineId, periodStart, periodEnd } = await ownedMachineWithOneSale();
    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const discarded = await machineSettlementService.discardDraft(BUSINESS_ID, settlementId);
    expect(discarded.distributableOwnerKes).toBe(200);
    expect(await machineSettlementService.findById(BUSINESS_ID, settlementId)).toBeNull();
    await expect(machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' })).resolves.toEqual(expect.any(String));
    expect((await partnerRepository.findById(BUSINESS_ID, partnerId))?.availableCashKes).toBe(0);
  });

  it('won’t finalize while a sale in the period has conflicting outcomes', async () => {
    const { partnerId, machineId, periodStart, periodEnd, transactionId } = await ownedMachineWithOneSale();
    await adminFirestore.collection('machineTransactions').doc(transactionId).update({ outcomeConflict: { resolved: false } });
    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    await expect(machineSettlementService.finalize(BUSINESS_ID, settlementId, 'staff-1', 200)).rejects.toThrow('conflicting outcomes');
    expect((await partnerRepository.findById(BUSINESS_ID, partnerId))?.availableCashKes).toBe(0);
    expect((await machineSettlementService.findById(BUSINESS_ID, settlementId))?.status).toBe('draft');
  });

  it('won’t hand a machine to a new owner while the old owner’s subscription is open', async () => {
    const { partnerId, machineId } = await ownedMachineWithOneSale();
    const buyer = await partnerService.create({ businessId: BUSINESS_ID, name: 'Buyer', actor: 'staff-1' });
    const subscriptionId = await machineSubscriptionService.createSubscription({ businessId: BUSINESS_ID, machineId, partnerId, planName: 'Standard', amountKes: 1000, frequency: 'monthly' });
    await expect(machineService.reassignOwner(BUSINESS_ID, machineId, buyer, 'staff-1')).rejects.toThrow('Cancel it first');
    await machineSubscriptionService.cancelSubscription(BUSINESS_ID, subscriptionId);
    await expect(machineService.reassignOwner(BUSINESS_ID, machineId, buyer, 'staff-1')).resolves.toBeUndefined();
  });
});

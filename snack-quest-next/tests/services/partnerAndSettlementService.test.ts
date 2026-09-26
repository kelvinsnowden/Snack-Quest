import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { partnerService } from '@/services/partnerService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

const BUSINESS_ID = 'biz-partner-settlement-test';

async function seedMachineWithSlot(adapter: MockVendingAdapter, ownerPartnerId: string | null, quantity = 5) {
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
    capacity: 10,
    position: 1,
  });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId };
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
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('partnerService', () => {
  it('creates a partner and lists it back for the business', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const partner = await partnerService.findById(BUSINESS_ID, partnerId);
    expect(partner?.name).toBe('Acme Distribution');
    expect(partner?.status).toBe('active');

    const partners = await partnerService.listByBusiness(BUSINESS_ID);
    expect(partners.map((p) => p.id)).toContain(partnerId);
  });

  it('lists only the machines owned by that partner', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const otherPartnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Other Partner', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId: ownedMachine } = await seedMachineWithSlot(adapter, partnerId);
    await seedMachineWithSlot(adapter, otherPartnerId);
    await seedMachineWithSlot(adapter, null);

    const machines = await partnerService.listMachines(BUSINESS_ID, partnerId);
    expect(machines).toHaveLength(1);
    expect(machines[0].id).toBe(ownedMachine);
  });
});

describe('machineSettlementService.computeGrossForPeriod', () => {
  it('sums only dispensed transactions within the window', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, partnerId, 5);

    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const result = await machineSettlementService.computeGrossForPeriod(BUSINESS_ID, machineId, periodStart, periodEnd);
    expect(result.grossSalesKes).toBe(700);
    expect(result.transactionCount).toBe(2);
    expect(result.refundsKes).toBe(0);
  });

  it('excludes transactions outside the requested window', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, partnerId, 5);
    await dispenseOneSale(adapter, machineId);

    const farFuturePeriodStart = new Date(Date.now() + 3_600_000);
    const farFuturePeriodEnd = new Date(Date.now() + 7_200_000);
    const result = await machineSettlementService.computeGrossForPeriod(BUSINESS_ID, machineId, farFuturePeriodStart, farFuturePeriodEnd);
    expect(result.grossSalesKes).toBe(0);
    expect(result.transactionCount).toBe(0);
  });
});

describe('machineSettlementService.createDraft', () => {
  it('leaves every commercial-term figure null when no agreement exists', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, partnerId, 5);
    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const doc = await adminFirestore.collection('machineSettlements').doc(settlementId).get();
    const data = doc.data();

    expect(data?.grossSalesKes).toBe(350);
    expect(data?.agreementId).toBeNull();
    expect(data?.netDistributableKes).toBeNull();
    expect(data?.partnerShareKes).toBeNull();
    expect(data?.businessShareKes).toBeNull();
    expect(data?.status).toBe('draft');
  });

  it('computes the partner/business split once an active agreement supplies a revenue-share percentage', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, partnerId, 5);
    await partnerMachineAgreementRepository.create({
      businessId: BUSINESS_ID,
      partnerId,
      machineId,
      status: 'active',
      revenueSharePartnerPct: 30,
      operatingCostNote: null,
      effectiveFrom: null,
      effectiveTo: null,
      documentRef: null,
      note: null,
      createdBy: 'staff-1',
    });

    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const doc = await adminFirestore.collection('machineSettlements').doc(settlementId).get();
    const data = doc.data();

    expect(data?.grossSalesKes).toBe(700);
    expect(data?.agreementId).not.toBeNull();
    expect(data?.netDistributableKes).toBe(700);
    expect(data?.partnerShareKes).toBe(210);
    expect(data?.businessShareKes).toBe(490);
  });

  it('ignores a draft (non-active) agreement and still leaves terms null', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Acme Distribution', actor: 'staff-1' });
    const adapter = new MockVendingAdapter();
    const { machineId } = await seedMachineWithSlot(adapter, partnerId, 5);
    await partnerMachineAgreementRepository.create({
      businessId: BUSINESS_ID,
      partnerId,
      machineId,
      status: 'draft',
      revenueSharePartnerPct: 40,
      operatingCostNote: null,
      effectiveFrom: null,
      effectiveTo: null,
      documentRef: null,
      note: null,
      createdBy: 'staff-1',
    });

    const periodStart = new Date(Date.now() - 60_000);
    await dispenseOneSale(adapter, machineId);
    const periodEnd = new Date(Date.now() + 60_000);

    const settlementId = await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId, periodStart, periodEnd, actor: 'staff-1' });
    const doc = await adminFirestore.collection('machineSettlements').doc(settlementId).get();
    const data = doc.data();

    expect(data?.agreementId).toBeNull();
    expect(data?.partnerShareKes).toBeNull();
  });
});

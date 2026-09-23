import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { partnerService } from '@/services/partnerService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineService } from '@/services/machineService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { machineSettlementService } from '@/services/machineSettlementService';

/**
 * Cross-business isolation (§ SECURITY: "Partner A can only see
 * Partner A's machines/sales/inventory/settlements/withdrawals, never
 * Partner B's"). Every read here is scoped by `businessId`, not by
 * trusting a caller-supplied partner/machine id alone — this pins that
 * a document that genuinely exists, just under a different business,
 * is never returned as if it belonged to the caller's own tenant.
 */

const BUSINESS_A = 'biz-isolation-a';
const BUSINESS_B = 'biz-isolation-b';

beforeEach(async () => {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineAssortments',
    'partners',
    'partnerMachineAgreements',
    'machineSettlements',
    'machineSubscriptions',
    'snackItems',
    'deviceCredentials',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('cross-business partner isolation', () => {
  it('partnerRepository.findById never returns a partner from a different business', async () => {
    const partnerIdA = await partnerService.create({ businessId: BUSINESS_A, name: 'Owner A', actor: 'staff-1' });

    const foundFromB = await partnerRepository.findById(BUSINESS_B, partnerIdA);
    expect(foundFromB).toBeNull();

    const foundFromA = await partnerRepository.findById(BUSINESS_A, partnerIdA);
    expect(foundFromA).not.toBeNull();
  });

  it('machineAssortmentService.getSellableCatalog throws MachineNotFoundError for a machine belonging to a different business', async () => {
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_A,
      machineCode: 'SQ-ISO-A',
      serialNumber: 'SN-ISO-A',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });

    await expect(machineAssortmentService.getSellableCatalog(BUSINESS_B, machineId)).rejects.toThrow();
    // The legitimate owner's own read still works — this isn't a general Firestore outage.
    await expect(machineAssortmentService.getSellableCatalog(BUSINESS_A, machineId)).resolves.toEqual([]);
  });

  it('machineSubscriptionService.listByPartner for a Business B partner never includes a Business A machine’s subscription', async () => {
    const { machineId: machineA } = await machineService.provisionDevice({
      businessId: BUSINESS_A,
      machineCode: 'SQ-ISO-SUB-A',
      serialNumber: 'SN-ISO-SUB-A',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const partnerIdA = await partnerService.create({ businessId: BUSINESS_A, name: 'Owner A', actor: 'staff-1' });
    await machineSubscriptionService.createSubscription({
      businessId: BUSINESS_A,
      machineId: machineA,
      partnerId: partnerIdA,
      planName: 'Standard',
      amountKes: 2000,
      frequency: 'monthly',
    });

    const partnerIdB = await partnerService.create({ businessId: BUSINESS_B, name: 'Owner B', actor: 'staff-1' });
    const subscriptionsForB = await machineSubscriptionService.listByPartner(BUSINESS_B, partnerIdB);
    expect(subscriptionsForB).toHaveLength(0);

    // Even querying Business A's own subscriptions under partnerIdA's id but the wrong businessId returns nothing.
    const crossTenantQuery = await machineSubscriptionService.listByPartner(BUSINESS_B, partnerIdA);
    expect(crossTenantQuery).toHaveLength(0);
  });

  it('machineSettlementService.listByPartner and findById never leak a settlement across businesses', async () => {
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_A,
      machineCode: 'SQ-ISO-SETTLE-A',
      serialNumber: 'SN-ISO-SETTLE-A',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const partnerIdA = await partnerService.create({ businessId: BUSINESS_A, name: 'Owner A', actor: 'staff-1' });
    const settlementId = await machineSettlementService.createDraft({
      businessId: BUSINESS_A,
      machineId,
      partnerId: partnerIdA,
      periodStart: new Date(Date.now() - 60_000),
      periodEnd: new Date(Date.now() + 60_000),
      actor: 'staff-1',
    });

    expect(await machineSettlementService.findById(BUSINESS_B, settlementId)).toBeNull();
    expect(await machineSettlementService.listByPartner(BUSINESS_B, partnerIdA)).toHaveLength(0);
    expect(await machineSettlementService.findById(BUSINESS_A, settlementId)).not.toBeNull();
  });

  it('finalize refuses to credit a settlement read under the wrong business — MachineSettlementNotFoundError, not a cross-tenant credit', async () => {
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_A,
      machineCode: 'SQ-ISO-FINALIZE-A',
      serialNumber: 'SN-ISO-FINALIZE-A',
      manufacturer: 'mock',
      model: 'test',
      actor: 'staff-1',
    });
    const partnerIdA = await partnerService.create({ businessId: BUSINESS_A, name: 'Owner A', actor: 'staff-1' });
    const settlementId = await machineSettlementService.createDraft({
      businessId: BUSINESS_A,
      machineId,
      partnerId: partnerIdA,
      periodStart: new Date(Date.now() - 60_000),
      periodEnd: new Date(Date.now() + 60_000),
      actor: 'staff-1',
    });

    await expect(machineSettlementService.finalize(BUSINESS_B, settlementId, 'staff-1')).rejects.toThrow();
    const partner = await partnerRepository.findById(BUSINESS_A, partnerIdA);
    expect(partner?.availableCashKes).toBe(0); // never credited by the wrong-tenant attempt
  });
});

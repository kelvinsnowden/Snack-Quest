import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { machineDealService, MachineDealValidationError } from '@/services/machineDealService';
import { MachineDealStateError } from '@/repositories/machineDealRepository';

/** Machine costs and sales on the emulator (§ MACHINE DEALS). */

const BUSINESS_ID = 'biz-machine-deals';
const OTHER = 'biz-machine-deals-other';

beforeEach(async () => {
  for (const businessId of [BUSINESS_ID, OTHER]) {
    for (const collection of ['machines', 'partners', 'machineCostLines', 'machineDeals', 'machineOwnershipHistory', 'deviceCredentials']) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
  }
});

async function machine(businessId = BUSINESS_ID, ownerPartnerId: string | null = null) {
  const { machineId } = await machineService.provisionDevice({ businessId, machineCode: `SQ-MD-${Math.random().toString(36).slice(2, 8)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', ownerPartnerId, actor: 'staff-1' });
  return machineId;
}

const cost = (category: string, amountKes: number, occurredOn = '2026-09-01') => ({ category, description: `${category} invoice`, amountKes, occurredOn });

describe('costs', () => {
  it('records landed and installation costs and sums them by group', async () => {
    const machineId = await machine();
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('purchase', 280_000));
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('duty_clearing', 62_000));
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('installation', 12_000));
    const view = await machineDealService.forMachine(BUSINESS_ID, machineId);
    expect(view.summary).toMatchObject({ landedKes: 342_000, installationKes: 12_000, totalCostKes: 354_000, profitKes: null });
  });

  it('refuses bad input: unknown category, zero, decimals, a future date, no description', async () => {
    const machineId = await machine();
    for (const bad of [cost('lunch', 1000), cost('purchase', 0), cost('purchase', 10.5), cost('purchase', 1000, '2999-01-01'), { ...cost('purchase', 1000), description: ' ' }]) {
      await expect(machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, bad)).rejects.toBeInstanceOf(MachineDealValidationError);
    }
  });

  it('a voided cost stays in the ledger but leaves the totals; it can’t be voided twice', async () => {
    const machineId = await machine();
    const id = await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('purchase', 280_000));
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('purchase', 280_000));
    await machineDealService.voidCost(BUSINESS_ID, 'staff-1', id, 'Entered twice');
    const view = await machineDealService.forMachine(BUSINESS_ID, machineId);
    expect(view.costs).toHaveLength(2);
    expect(view.summary.landedKes).toBe(280_000);
    await expect(machineDealService.voidCost(BUSINESS_ID, 'staff-1', id, 'again')).rejects.toBeInstanceOf(MachineDealStateError);
  });

  it('another business’s machine or cost is not found', async () => {
    const theirs = await machine(OTHER);
    await expect(machineDealService.recordCost(BUSINESS_ID, 'staff-1', theirs, cost('purchase', 1000))).rejects.toThrow('Machine not found.');
    const theirCost = await machineDealService.recordCost(OTHER, 'staff-1', theirs, cost('purchase', 1000));
    await expect(machineDealService.voidCost(BUSINESS_ID, 'staff-1', theirCost, 'not mine')).rejects.toThrow();
  });
});

describe('sale', () => {
  it('profit = machine price + installation charged − landed − installation cost', async () => {
    const owner = await partnerService.create({ businessId: BUSINESS_ID, name: 'Owner', actor: 'staff-1' });
    const machineId = await machine(BUSINESS_ID, owner);
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('purchase', 300_000));
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('installation', 15_000));
    const sale = await machineDealService.recordSale(BUSINESS_ID, 'staff-1', machineId, { soldOn: '2026-09-20', machinePriceKes: 450_000, installationChargeKes: 20_000 });
    expect(sale.buyerPartnerId).toBe(owner);
    expect((await machineDealService.forMachine(BUSINESS_ID, machineId)).summary).toMatchObject({ saleRevenueKes: 470_000, profitKes: 155_000 });
  });

  it('one live sale per machine; cancelling keeps it in history and allows a new one', async () => {
    const machineId = await machine();
    await machineDealService.recordSale(BUSINESS_ID, 'staff-1', machineId, { soldOn: '2026-09-20', machinePriceKes: 450_000 });
    await expect(machineDealService.recordSale(BUSINESS_ID, 'staff-1', machineId, { soldOn: '2026-09-21', machinePriceKes: 460_000 })).rejects.toBeInstanceOf(MachineDealStateError);
    await expect(machineDealService.cancelSale(BUSINESS_ID, 'staff-1', machineId, ' ')).rejects.toBeInstanceOf(MachineDealValidationError);
    await machineDealService.cancelSale(BUSINESS_ID, 'staff-1', machineId, 'Wrong price');
    await machineDealService.recordSale(BUSINESS_ID, 'staff-1', machineId, { soldOn: '2026-09-21', machinePriceKes: 460_000 });
    const view = await machineDealService.forMachine(BUSINESS_ID, machineId);
    expect(view.deal?.sale?.machinePriceKes).toBe(460_000);
    expect(view.deal?.cancelledSales.map((entry) => entry.reason)).toEqual(['Wrong price']);
  });

  it('an unknown buyer is refused', async () => {
    const machineId = await machine();
    await expect(machineDealService.recordSale(BUSINESS_ID, 'staff-1', machineId, { soldOn: '2026-09-20', machinePriceKes: 450_000, buyerPartnerId: 'nobody' })).rejects.toBeInstanceOf(MachineDealValidationError);
  });

  it('“no installation cost” lets the profit be stated with only a landed cost', async () => {
    const machineId = await machine();
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', machineId, cost('purchase', 300_000));
    await machineDealService.recordSale(BUSINESS_ID, 'staff-1', machineId, { soldOn: '2026-09-20', machinePriceKes: 400_000 });
    expect((await machineDealService.forMachine(BUSINESS_ID, machineId)).summary.missing).toEqual(['installation_cost']);
    await machineDealService.setNoInstallationCost(BUSINESS_ID, machineId, true);
    expect((await machineDealService.forMachine(BUSINESS_ID, machineId)).summary.profitKes).toBe(100_000);
  });
});

describe('fleet', () => {
  it('every machine of this business with its own numbers, none of another’s', async () => {
    const a = await machine();
    await machine();
    await machine(OTHER);
    await machineDealService.recordCost(BUSINESS_ID, 'staff-1', a, cost('purchase', 300_000));
    const fleet = await machineDealService.forFleet(BUSINESS_ID);
    expect(fleet).toHaveLength(2);
    expect(fleet.find((row) => row.machineId === a)?.summary.landedKes).toBe(300_000);
  });
});

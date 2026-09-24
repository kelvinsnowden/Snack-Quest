import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locationService, LocationNotFoundError } from '@/services/locationService';
import { machineService } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { adminFirestore } from '@/lib/firebase/admin';

const BUSINESS_ID = 'biz-location-test';

async function cleanCollections() {
  for (const collection of ['locations', 'machines', 'machineLocationHistory', 'deviceCredentials', 'partners', 'machineSlots', 'machineTransactions', 'machineSettlements']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionMachine(machineCode: string) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode,
    serialNumber: `SN-${machineCode}`,
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  return machineId;
}

describe('LocationService.create', () => {
  it('creates a location profile with defaults for every optional field', async () => {
    const locationId = await locationService.create({
      businessId: BUSINESS_ID,
      name: 'Test University Hub',
      locationType: 'university',
      city: 'Nairobi',
      actor: 'staff-1',
    });

    const location = await locationService.findById(BUSINESS_ID, locationId);
    expect(location?.name).toBe('Test University Hub');
    expect(location?.locationType).toBe('university');
    expect(location?.city).toBe('Nairobi');
    expect(location?.nearbyBusinesses).toEqual([]);
    expect(location?.competingFoodBeverageOutlets).toEqual([]);
    expect(location?.estimatedFootTraffic).toBeNull();
    expect(location?.launchDate).toBeNull();
  });

  it('stores real, staff-supplied profile attributes when given', async () => {
    const locationId = await locationService.create({
      businessId: BUSINESS_ID,
      name: 'Riverside Mall',
      locationType: 'mall',
      city: 'Nairobi',
      area: 'Riverside',
      estimatedFootTraffic: 5000,
      customerType: 'general_public',
      indoorOutdoor: 'indoor',
      nearbyBusinesses: ['Cinema', 'Supermarket'],
      competingFoodBeverageOutlets: ['Java House'],
      actor: 'staff-1',
    });

    const location = await locationService.findById(BUSINESS_ID, locationId);
    expect(location?.estimatedFootTraffic).toBe(5000);
    expect(location?.customerType).toBe('general_public');
    expect(location?.nearbyBusinesses).toEqual(['Cinema', 'Supermarket']);
    expect(location?.competingFoodBeverageOutlets).toEqual(['Java House']);
  });
});

describe('LocationService — machine isolation', () => {
  it('a location can have zero, one, or multiple machines — never assumed to be exactly one', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Airport T1', locationType: 'airport', city: 'Nairobi', actor: 'staff-1' });

    expect(await locationService.machinesAtLocation(BUSINESS_ID, locationId)).toHaveLength(0);

    const m1 = await provisionMachine('SQ-LOC-1');
    const m2 = await provisionMachine('SQ-LOC-2');
    await machineService.relocate(BUSINESS_ID, m1, { locationId, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
    await machineService.relocate(BUSINESS_ID, m2, { locationId, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');

    const machines = await locationService.machinesAtLocation(BUSINESS_ID, locationId);
    expect(machines.map((m) => m.id).sort()).toEqual([m1, m2].sort());
  });

  it('never returns a machine that has since moved to a different location', async () => {
    const locationA = await locationService.create({ businessId: BUSINESS_ID, name: 'Location A', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    const locationB = await locationService.create({ businessId: BUSINESS_ID, name: 'Location B', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    const machineId = await provisionMachine('SQ-LOC-MOVE');

    await machineService.relocate(BUSINESS_ID, machineId, { locationId: locationA, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
    expect(await locationService.machinesAtLocation(BUSINESS_ID, locationA)).toHaveLength(1);

    await machineService.relocate(BUSINESS_ID, machineId, { locationId: locationB, latitude: null, longitude: null, address: null, venueName: null }, 'staff-1');
    expect(await locationService.machinesAtLocation(BUSINESS_ID, locationA)).toHaveLength(0);
    expect(await locationService.machinesAtLocation(BUSINESS_ID, locationB)).toHaveLength(1);
  });
});

describe('LocationService.listByType', () => {
  it('filters to exactly the requested locationType', async () => {
    await locationService.create({ businessId: BUSINESS_ID, name: 'Uni 1', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    await locationService.create({ businessId: BUSINESS_ID, name: 'Uni 2', locationType: 'university', city: 'Nairobi', actor: 'staff-1' });
    await locationService.create({ businessId: BUSINESS_ID, name: 'Hotel 1', locationType: 'hotel', city: 'Nairobi', actor: 'staff-1' });

    const universities = await locationService.listByType(BUSINESS_ID, 'university');
    expect(universities).toHaveLength(2);
    expect(universities.every(({ data }) => data.locationType === 'university')).toBe(true);
  });
});

describe('LocationService.update', () => {
  it('updates the given fields and leaves the rest untouched', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Old Name', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    await locationService.update(BUSINESS_ID, locationId, { name: 'New Name', estimatedFootTraffic: 1200 }, 'staff-2');

    const location = await locationService.findById(BUSINESS_ID, locationId);
    expect(location?.name).toBe('New Name');
    expect(location?.estimatedFootTraffic).toBe(1200);
    expect(location?.locationType).toBe('office');
    expect(location?.updatedBy).toBe('staff-2');
  });

  it('throws LocationNotFoundError for a location belonging to a different business', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Isolated', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    await expect(locationService.update('some-other-business', locationId, { name: 'Hijacked' }, 'staff-1')).rejects.toThrow(LocationNotFoundError);

    const location = await locationService.findById(BUSINESS_ID, locationId);
    expect(location?.name).toBe('Isolated');
  });
});

describe('LocationService.setOwnerExpenses', () => {
  it('stores the owner\'s own costs, leaving unset fields null rather than defaulting to zero', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Owner Costs Location', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    expect((await locationService.findById(BUSINESS_ID, locationId))?.expenses).toBeNull();

    await locationService.setOwnerExpenses(BUSINESS_ID, locationId, { monthlyRentKes: 15000, placementFeeKes: 5000, monthlyElectricityKes: null, locationCommissionPct: 10 }, 'owner-uid-1');

    const location = await locationService.findById(BUSINESS_ID, locationId);
    expect(location?.expenses?.monthlyRentKes).toBe(15000);
    expect(location?.expenses?.placementFeeKes).toBe(5000);
    expect(location?.expenses?.monthlyElectricityKes).toBeNull();
    expect(location?.expenses?.locationCommissionPct).toBe(10);
  });

  it('never changes machine settlement math — distributable profit stays revenue minus COGS minus subscription regardless of what is recorded here', async () => {
    const partnerId = await partnerService.create({ businessId: BUSINESS_ID, name: 'Cost-Recording Owner', actor: 'staff-1' });
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Settlement-Isolation Location', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    const { machineId } = await machineService.provisionDevice({
      businessId: BUSINESS_ID,
      machineCode: `SQ-EXP-${Date.now()}`,
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
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 200, capacity: 20, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 10 });

    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });

    // Two distinct periods (not the same period twice) — kept independent of whatever dedupe-by-period guard `createDraft` may also enforce.
    const withoutExpensesId = await machineSettlementService.createDraft({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      periodStart: new Date(Date.now() - 4 * 60 * 60 * 1000),
      periodEnd: new Date(Date.now() - 3 * 60 * 60 * 1000),
      actor: 'staff-1',
    });
    const withoutExpenses = await machineSettlementService.listByMachine(BUSINESS_ID, machineId);

    // Recording a large rent/placement/electricity/commission figure — this must never touch the settlement.
    await locationService.setOwnerExpenses(BUSINESS_ID, locationId, { monthlyRentKes: 999_000, placementFeeKes: 500_000, monthlyElectricityKes: 80_000, locationCommissionPct: 50 }, 'owner-uid-1');

    const withExpensesId = await machineSettlementService.createDraft({
      businessId: BUSINESS_ID,
      machineId,
      partnerId,
      periodStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
      periodEnd: new Date(Date.now() - 1 * 60 * 60 * 1000),
      actor: 'staff-1',
    });
    const withExpenses = await machineSettlementService.listByMachine(BUSINESS_ID, machineId);

    const before = withoutExpenses.find((s) => s.id === withoutExpensesId)!.data;
    const after = withExpenses.find((s) => s.id === withExpensesId)!.data;
    expect(after.distributableOwnerKes).toBe(before.distributableOwnerKes);
    expect(after.grossSalesKes).toBe(before.grossSalesKes);
    expect(after.cogsKes).toBe(before.cogsKes);
  });

  it('throws LocationNotFoundError for a location belonging to a different business', async () => {
    const locationId = await locationService.create({ businessId: BUSINESS_ID, name: 'Isolated Costs', locationType: 'office', city: 'Nairobi', actor: 'staff-1' });
    await expect(
      locationService.setOwnerExpenses('some-other-business', locationId, { monthlyRentKes: 1000, placementFeeKes: null, monthlyElectricityKes: null, locationCommissionPct: null }, 'owner-uid-1'),
    ).rejects.toThrow(LocationNotFoundError);
  });
});

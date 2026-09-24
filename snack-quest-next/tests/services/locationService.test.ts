import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locationService, LocationNotFoundError } from '@/services/locationService';
import { machineService } from '@/services/machineService';
import { adminFirestore } from '@/lib/firebase/admin';

const BUSINESS_ID = 'biz-location-test';

async function cleanCollections() {
  for (const collection of ['locations', 'machines', 'machineLocationHistory', 'deviceCredentials']) {
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

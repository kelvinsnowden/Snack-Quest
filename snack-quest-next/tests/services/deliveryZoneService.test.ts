import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { deliveryZoneService, DeliveryZoneValidationError } from '@/services/deliveryZoneService';

const BUSINESS_ID = 'biz-delivery-zone-service-test';
const OTHER_BUSINESS_ID = 'biz-delivery-zone-service-other';

function station(overrides: Partial<Parameters<typeof pickupStationRepository.create>[0]> = {}) {
  return {
    businessId: BUSINESS_ID,
    courier: 'tushop',
    name: 'Test Station',
    latitude: -1.2921,
    longitude: 36.8219,
    description: '',
    county: 'Nairobi',
    town: 'CBD',
    zone: 'Nairobi',
    shippingOrigin: 'Nairobi',
    packageCategory: 'small',
    deliveryFeeKes: 0,
    isActive: true,
    searchTokens: ['test', 'station'],
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    adminFirestore.recursiveDelete(adminFirestore.collection('deliveryZoneRules')),
    adminFirestore.recursiveDelete(adminFirestore.collection('pickupStations')),
  ]);
});

describe('DeliveryZoneService.listZones', () => {
  it('lists zones with their fee and matching station count', async () => {
    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: BUSINESS_ID,
      zone: 'Nairobi',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: null,
    });
    await pickupStationRepository.create(station({ name: 'Station A' }), 'system');
    await pickupStationRepository.create(station({ name: 'Station B' }), 'system');
    await pickupStationRepository.create(station({ zone: null, name: 'Unzoned' }), 'system');

    const { zones, unzonedStationCount } = await deliveryZoneService.listZones(BUSINESS_ID);

    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ zone: 'Nairobi', feeKes: null, stationCount: 2 });
    expect(unzonedStationCount).toBe(1);
  });

  it('never mixes zones across businesses', async () => {
    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: OTHER_BUSINESS_ID,
      zone: 'Nairobi',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 200,
    });

    const { zones } = await deliveryZoneService.listZones(BUSINESS_ID);
    expect(zones).toHaveLength(0);
  });
});

describe('DeliveryZoneService.setZoneFee', () => {
  const key = { zone: 'Nairobi', shippingOrigin: 'Nairobi', packageCategory: 'small', courier: 'tushop' };

  it('sets the zone fee and fans it out to every matching station', async () => {
    await deliveryZoneRuleRepository.upsertIfMissing({ businessId: BUSINESS_ID, ...key, feeKes: null });
    const stationA = await pickupStationRepository.create(station({ name: 'Station A' }), 'system');
    const stationB = await pickupStationRepository.create(station({ name: 'Station B' }), 'system');
    const otherZoneStation = await pickupStationRepository.create(
      station({ name: 'Mombasa Station', zone: 'Mombasa', shippingOrigin: 'Mombasa' }),
      'system',
    );

    const { stationsUpdated } = await deliveryZoneService.setZoneFee(BUSINESS_ID, key, 250, 'staff-1');

    expect(stationsUpdated).toBe(2);
    const fee = await deliveryZoneRuleRepository.findFee(BUSINESS_ID, key.zone, key.shippingOrigin, key.packageCategory, key.courier);
    expect(fee).toBe(250);

    const [a, b, other] = await Promise.all([
      pickupStationRepository.findById(BUSINESS_ID, stationA),
      pickupStationRepository.findById(BUSINESS_ID, stationB),
      pickupStationRepository.findById(BUSINESS_ID, otherZoneStation),
    ]);
    expect(a?.deliveryFeeKes).toBe(250);
    expect(b?.deliveryFeeKes).toBe(250);
    expect(other?.deliveryFeeKes).toBe(0);
  });

  it('treats 0 as a valid, deliberate "free pickup" fee', async () => {
    await deliveryZoneRuleRepository.upsertIfMissing({ businessId: BUSINESS_ID, ...key, feeKes: null });
    const stationId = await pickupStationRepository.create(station({ deliveryFeeKes: 999 }), 'system');

    await deliveryZoneService.setZoneFee(BUSINESS_ID, key, 0, 'staff-1');

    const fee = await deliveryZoneRuleRepository.findFee(BUSINESS_ID, key.zone, key.shippingOrigin, key.packageCategory, key.courier);
    expect(fee).toBe(0);
    const found = await pickupStationRepository.findById(BUSINESS_ID, stationId);
    expect(found?.deliveryFeeKes).toBe(0);
  });

  it('rejects a blank zone', async () => {
    await expect(deliveryZoneService.setZoneFee(BUSINESS_ID, { ...key, zone: '  ' }, 100, 'staff-1')).rejects.toBeInstanceOf(
      DeliveryZoneValidationError,
    );
  });

  it('rejects a negative fee', async () => {
    await expect(deliveryZoneService.setZoneFee(BUSINESS_ID, key, -1, 'staff-1')).rejects.toBeInstanceOf(DeliveryZoneValidationError);
  });

  it('does not touch stations from a different shipping origin or package category sharing the same zone name', async () => {
    await deliveryZoneRuleRepository.upsertIfMissing({ businessId: BUSINESS_ID, ...key, feeKes: null });
    const regionalStation = await pickupStationRepository.create(
      station({ name: 'Nairobi Regional', packageCategory: 'large' }),
      'system',
    );

    await deliveryZoneService.setZoneFee(BUSINESS_ID, key, 150, 'staff-1');

    const found = await pickupStationRepository.findById(BUSINESS_ID, regionalStation);
    expect(found?.deliveryFeeKes).toBe(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { shipmentRepository, type ShipmentInput } from '@/repositories/shipmentRepository';

/** `shipmentRepository`'s admin-facing surface (§ Admin: Delivery monitoring) — findById/listByBusiness, against the real emulator. */

const BUSINESS_ID = 'biz-shipment-repo-test';
const OTHER_BUSINESS_ID = 'biz-shipment-repo-other';

function shipmentInput(overrides: Partial<ShipmentInput> = {}): ShipmentInput {
  return {
    businessId: BUSINESS_ID,
    orderId: 'order-1',
    method: 'door',
    provider: 'bolt',
    courierShipmentRef: null,
    trackingUrl: null,
    recipientName: 'Jane Wanjiru',
    recipientPhone: '254712345678',
    county: 'Nairobi',
    addressText: '123 Example Street',
    ...overrides,
  };
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('shipments'));
});

describe('shipmentRepository.findById', () => {
  it('is scoped to its business', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'pending_manual_booking');

    const found = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(found?.recipientName).toBe('Jane Wanjiru');

    const wrongBusiness = await shipmentRepository.findById(OTHER_BUSINESS_ID, id);
    expect(wrongBusiness).toBeNull();
  });
});

describe('shipmentRepository.listByBusiness', () => {
  it('lists only the given business, newest first, filterable by status', async () => {
    await shipmentRepository.create(shipmentInput({ businessId: OTHER_BUSINESS_ID }), 'pending');
    const first = await shipmentRepository.create(shipmentInput(), 'pending_manual_booking');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await shipmentRepository.create(shipmentInput(), 'delivered');

    const all = await shipmentRepository.listByBusiness(BUSINESS_ID);
    expect(all.shipments.map((s) => s.id)).toEqual([second, first]);

    const manualOnly = await shipmentRepository.listByBusiness(BUSINESS_ID, { status: 'pending_manual_booking' });
    expect(manualOnly.shipments.map((s) => s.id)).toEqual([first]);
  });
});

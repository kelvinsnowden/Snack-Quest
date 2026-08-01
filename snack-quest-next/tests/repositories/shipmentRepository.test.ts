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

describe('shipmentRepository defaults', () => {
  it('creates with an empty trackingEvents array and a null deliveredAt', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'created');

    const found = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(found?.trackingEvents).toEqual([]);
    expect(found?.deliveredAt).toBeNull();
  });
});

describe('shipmentRepository.updateStatus', () => {
  it('stamps deliveredAt only when the new status is delivered', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'created');

    await shipmentRepository.updateStatus(id, 'in_transit');
    expect((await shipmentRepository.findById(BUSINESS_ID, id))?.deliveredAt).toBeNull();

    await shipmentRepository.updateStatus(id, 'delivered');
    expect((await shipmentRepository.findById(BUSINESS_ID, id))?.deliveredAt).not.toBeNull();
  });
});

describe('shipmentRepository.findByCourierShipmentRef', () => {
  it('finds a shipment by its courier reference, scoped to the business', async () => {
    const id = await shipmentRepository.create(shipmentInput({ courierShipmentRef: 'JUMIA-REF-1' }), 'created');

    const found = await shipmentRepository.findByCourierShipmentRef(BUSINESS_ID, 'JUMIA-REF-1');
    expect(found?.id).toBe(id);

    expect(await shipmentRepository.findByCourierShipmentRef(OTHER_BUSINESS_ID, 'JUMIA-REF-1')).toBeNull();
    expect(await shipmentRepository.findByCourierShipmentRef(BUSINESS_ID, 'no-such-ref')).toBeNull();
  });
});

describe('shipmentRepository.recordTrackingUpdate', () => {
  it('always appends the raw event, and only transitions status when nextStatus is given', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'created');

    await shipmentRepository.recordTrackingUpdate(id, {
      event: { status: 'warehouse_scan', description: null, occurredAt: new Date('2026-01-01T00:00:00Z') },
    });
    let found = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('created');
    expect(found?.trackingEvents).toHaveLength(1);
    expect(found?.trackingEvents[0].status).toBe('warehouse_scan');
    expect(found?.deliveredAt).toBeNull();

    await shipmentRepository.recordTrackingUpdate(id, {
      event: { status: 'delivered', description: null, occurredAt: new Date('2026-01-02T00:00:00Z') },
      nextStatus: 'delivered',
    });
    found = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(found?.status).toBe('delivered');
    expect(found?.trackingEvents).toHaveLength(2);
    expect(found?.deliveredAt).not.toBeNull();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { shipmentRepository, type ShipmentInput } from '@/repositories/shipmentRepository';
import {
  deliveryService,
  ShipmentNotFoundError,
  InvalidShipmentTransitionError,
} from '@/services/deliveryService';

/**
 * `DeliveryService`'s admin methods (§ Admin: Delivery monitoring) —
 * completing a manual booking, overriding status, and the transition
 * table enforcement, against the real emulator. `createShipmentForOrder`
 * itself is exercised via the full checkout journey elsewhere.
 */

const BUSINESS_ID = 'biz-delivery-admin-test';
const OTHER_BUSINESS_ID = 'biz-delivery-admin-other';

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
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('DeliveryService.completeManualBooking', () => {
  it('records the courier reference and moves the shipment to created', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'pending_manual_booking');

    await deliveryService.completeManualBooking(
      BUSINESS_ID,
      id,
      { courierShipmentRef: 'BOLT-TRIP-123', trackingUrl: 'https://bolt.example/track/123' },
      'staff-1',
    );

    const shipment = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(shipment?.status).toBe('created');
    expect(shipment?.courierShipmentRef).toBe('BOLT-TRIP-123');
    expect(shipment?.trackingUrl).toBe('https://bolt.example/track/123');
  });

  it('rejects a shipment that is not awaiting manual booking', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'created');

    await expect(
      deliveryService.completeManualBooking(BUSINESS_ID, id, { courierShipmentRef: 'X', trackingUrl: null }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidShipmentTransitionError);
  });

  it('throws ShipmentNotFoundError for a shipment in a different business', async () => {
    const id = await shipmentRepository.create(shipmentInput({ businessId: OTHER_BUSINESS_ID }), 'pending_manual_booking');

    await expect(
      deliveryService.completeManualBooking(BUSINESS_ID, id, { courierShipmentRef: 'X', trackingUrl: null }, 'staff-1'),
    ).rejects.toBeInstanceOf(ShipmentNotFoundError);
  });
});

describe('DeliveryService.updateShipmentStatus', () => {
  it('applies a valid override', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'created');

    await deliveryService.updateShipmentStatus(BUSINESS_ID, id, 'delivered', 'staff-1');

    const shipment = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(shipment?.status).toBe('delivered');
  });

  it('rejects a transition out of a terminal status', async () => {
    const id = await shipmentRepository.create(shipmentInput(), 'delivered');

    await expect(deliveryService.updateShipmentStatus(BUSINESS_ID, id, 'failed', 'staff-1')).rejects.toBeInstanceOf(
      InvalidShipmentTransitionError,
    );
  });
});

describe('DeliveryService.listShipments', () => {
  it('lists only the given business', async () => {
    await shipmentRepository.create(shipmentInput({ businessId: OTHER_BUSINESS_ID }), 'pending');
    await shipmentRepository.create(shipmentInput(), 'pending_manual_booking');

    const { shipments } = await deliveryService.listShipments(BUSINESS_ID);

    expect(shipments).toHaveLength(1);
  });
});

describe('DeliveryService.applyTrackingUpdate', () => {
  it('applies a valid mapped status transition and publishes ShipmentStatusChanged', async () => {
    const id = await shipmentRepository.create(shipmentInput({ courierShipmentRef: 'JUMIA-REF-1' }), 'created');

    const result = await deliveryService.applyTrackingUpdate(BUSINESS_ID, {
      courierShipmentRef: 'JUMIA-REF-1',
      status: 'in_transit',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });

    expect(result).toEqual({ shipmentId: id });
    const shipment = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(shipment?.status).toBe('in_transit');
    expect(shipment?.trackingEvents).toHaveLength(1);

    const events = await adminFirestore.collection('domainEvents').where('type', '==', 'ShipmentStatusChanged').get();
    expect(events.docs).toHaveLength(1);
    expect(events.docs[0].data().payload).toMatchObject({ shipmentId: id, from: 'created', to: 'in_transit' });
  });

  it('records the raw event but does not transition status when the raw status is unrecognized', async () => {
    const id = await shipmentRepository.create(shipmentInput({ courierShipmentRef: 'JUMIA-REF-2' }), 'created');

    await deliveryService.applyTrackingUpdate(BUSINESS_ID, {
      courierShipmentRef: 'JUMIA-REF-2',
      status: 'warehouse_scan',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });

    const shipment = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(shipment?.status).toBe('created');
    expect(shipment?.trackingEvents).toHaveLength(1);
    expect(shipment?.trackingEvents[0].status).toBe('warehouse_scan');

    const events = await adminFirestore.collection('domainEvents').where('type', '==', 'ShipmentStatusChanged').get();
    expect(events.docs).toHaveLength(0);
  });

  it('records the raw event but does not transition status when the mapped status is not a valid transition (e.g. already delivered)', async () => {
    const id = await shipmentRepository.create(shipmentInput({ courierShipmentRef: 'JUMIA-REF-3' }), 'delivered');

    await deliveryService.applyTrackingUpdate(BUSINESS_ID, {
      courierShipmentRef: 'JUMIA-REF-3',
      status: 'in_transit',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });

    const shipment = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(shipment?.status).toBe('delivered');
    expect(shipment?.trackingEvents).toHaveLength(1);
  });

  it('stamps deliveredAt when the mapped status is delivered', async () => {
    const id = await shipmentRepository.create(shipmentInput({ courierShipmentRef: 'JUMIA-REF-4' }), 'in_transit');

    await deliveryService.applyTrackingUpdate(BUSINESS_ID, {
      courierShipmentRef: 'JUMIA-REF-4',
      status: 'delivered',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });

    const shipment = await shipmentRepository.findById(BUSINESS_ID, id);
    expect(shipment?.status).toBe('delivered');
    expect(shipment?.deliveredAt).not.toBeNull();
  });

  it('returns null when no shipment matches the courierShipmentRef', async () => {
    const result = await deliveryService.applyTrackingUpdate(BUSINESS_ID, {
      courierShipmentRef: 'no-such-ref',
      status: 'delivered',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });
    expect(result).toBeNull();
  });

  it('is scoped to the given business — a matching ref on another tenant is not found', async () => {
    await shipmentRepository.create(shipmentInput({ businessId: OTHER_BUSINESS_ID, courierShipmentRef: 'SHARED-REF' }), 'created');

    const result = await deliveryService.applyTrackingUpdate(BUSINESS_ID, {
      courierShipmentRef: 'SHARED-REF',
      status: 'delivered',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    });
    expect(result).toBeNull();
  });
});

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

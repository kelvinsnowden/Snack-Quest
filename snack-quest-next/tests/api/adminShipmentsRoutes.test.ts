import { describe, expect, it, vi } from 'vitest';

const { completeManualBookingMock, updateShipmentStatusMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  completeManualBookingMock: vi.fn(),
  updateShipmentStatusMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/deliveryService', () => ({
  deliveryService: {
    completeManualBooking: completeManualBookingMock,
    updateShipmentStatus: updateShipmentStatusMock,
  },
  ShipmentNotFoundError: class ShipmentNotFoundError extends Error {},
  InvalidShipmentTransitionError: class InvalidShipmentTransitionError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as statusRoute } from '@/app/api/admin/shipments/[shipmentId]/status/route';
import { POST as completeBookingRoute } from '@/app/api/admin/shipments/[shipmentId]/complete-booking/route';
import { ShipmentNotFoundError, InvalidShipmentTransitionError } from '@/services/deliveryService';

/**
 * Route-handler-level tests for the Admin Delivery monitoring
 * endpoints (§ Admin: Delivery monitoring) — `DeliveryService` itself
 * is already covered by tests/services/deliveryServiceAdmin.test.ts;
 * these prove the wire.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/shipments/[shipmentId]/status', () => {
  function call(body: unknown) {
    return statusRoute(jsonRequest('http://localhost/api/admin/shipments/s1/status', body), {
      params: Promise.resolve({ shipmentId: 's1' }),
    });
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ status: 'delivered' });
    expect(response.status).toBe(401);
    expect(updateShipmentStatusMock).not.toHaveBeenCalled();
  });

  it('400s an unrecognized status value', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ status: 'not-a-real-status' });
    expect(response.status).toBe(400);
  });

  it('200s and calls the service scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateShipmentStatusMock.mockResolvedValue(undefined);

    const response = await call({ status: 'delivered' });

    expect(response.status).toBe(200);
    expect(updateShipmentStatusMock).toHaveBeenCalledWith('biz-1', 's1', 'delivered', 'staff-1');
  });

  it('404s a shipment the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateShipmentStatusMock.mockRejectedValue(new ShipmentNotFoundError('s1'));

    const response = await call({ status: 'delivered' });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateShipmentStatusMock.mockRejectedValue(new InvalidShipmentTransitionError('delivered', 'failed'));

    const response = await call({ status: 'failed' });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/admin/shipments/[shipmentId]/complete-booking', () => {
  function call(body: unknown) {
    return completeBookingRoute(jsonRequest('http://localhost/api/admin/shipments/s1/complete-booking', body), {
      params: Promise.resolve({ shipmentId: 's1' }),
    });
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ courierShipmentRef: 'X' });
    expect(response.status).toBe(401);
    expect(completeManualBookingMock).not.toHaveBeenCalled();
  });

  it('400s a missing courierShipmentRef', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({});
    expect(response.status).toBe(400);
  });

  /*
   * The Warehouse workspace's "Ready for courier" queue renders this
   * same dialog, and this route named only admin and agent — so the
   * button its own screen was showing came back 403. Booking a courier
   * is fulfillment, which is that workspace's whole job.
   */
  it('lets warehouse staff book the courier their own queue asks them to', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['warehouse'] });
    completeManualBookingMock.mockResolvedValue(undefined);

    const response = await call({ courierShipmentRef: 'BOLT-1' });

    expect(response.status).toBe(200);
    expect(completeManualBookingMock).toHaveBeenCalled();
  });

  /** Sales-only staff are still not doing fulfillment paperwork by accident. */
  it('403s a role with no fulfillment job at all', async () => {
    completeManualBookingMock.mockClear();
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['finance'] });

    const response = await call({ courierShipmentRef: 'BOLT-1' });

    expect(response.status).toBe(403);
    expect(completeManualBookingMock).not.toHaveBeenCalled();
  });

  it('200s and calls the service with a null trackingUrl when omitted', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    completeManualBookingMock.mockResolvedValue(undefined);

    const response = await call({ courierShipmentRef: 'BOLT-1' });

    expect(response.status).toBe(200);
    expect(completeManualBookingMock).toHaveBeenCalledWith(
      'biz-1',
      's1',
      { courierShipmentRef: 'BOLT-1', trackingUrl: null },
      'staff-1',
    );
  });

  it('404s a shipment the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    completeManualBookingMock.mockRejectedValue(new ShipmentNotFoundError('s1'));

    const response = await call({ courierShipmentRef: 'X' });
    expect(response.status).toBe(404);
  });
});

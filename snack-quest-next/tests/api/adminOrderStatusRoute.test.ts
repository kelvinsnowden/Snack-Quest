import { describe, expect, it, vi } from 'vitest';

const { updateStatusMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  updateStatusMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/orderService', () => ({
  orderService: { updateStatus: updateStatusMock },
  OrderNotFoundError: class OrderNotFoundError extends Error {},
  InvalidOrderTransitionError: class InvalidOrderTransitionError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as statusRoute } from '@/app/api/admin/orders/[orderId]/status/route';

/**
 * § security audit — `orders/{id}/status` is the one admin route
 * `components/warehouse/MarkDispatchedButton.tsx` (the Warehouse
 * workspace's own mutation) calls directly, so it needs the
 * `warehouse` role allowed alongside `admin`/`super_admin` — every
 * other admin route stays admin-only. Confirms both directions: a
 * bare `warehouse` session can use it, and an unrelated lower-privilege
 * role (`agent`) still can't.
 */
const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function request(body: unknown) {
  return new Request('http://localhost/api/admin/orders/o1/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/orders/[orderId]/status', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await statusRoute(request({ status: 'dispatched' }), {
      params: Promise.resolve({ orderId: 'o1' }),
    });
    expect(response.status).toBe(401);
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it('200s for the admin role', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateStatusMock.mockResolvedValue({ id: 'o1', status: 'dispatched' });

    const response = await statusRoute(request({ status: 'dispatched' }), {
      params: Promise.resolve({ orderId: 'o1' }),
    });

    expect(response.status).toBe(200);
    expect(updateStatusMock).toHaveBeenCalledWith('biz-1', 'o1', 'dispatched', 'staff-1', undefined);
  });

  it('allows the warehouse role — MarkDispatchedButton is the Warehouse workspace’s own mutation', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['warehouse'] });
    updateStatusMock.mockResolvedValue({ id: 'o1', status: 'dispatched' });

    const response = await statusRoute(request({ status: 'dispatched' }), {
      params: Promise.resolve({ orderId: 'o1' }),
    });

    expect(response.status).toBe(200);
  });

  it('403s a valid session that only holds the agent role', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['agent'] });
    const response = await statusRoute(request({ status: 'dispatched' }), {
      params: Promise.resolve({ orderId: 'o1' }),
    });
    expect(response.status).toBe(403);
  });
});

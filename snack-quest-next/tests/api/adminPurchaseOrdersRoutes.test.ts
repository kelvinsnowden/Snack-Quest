import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createPurchaseOrderMock,
  markOrderedMock,
  cancelPurchaseOrderMock,
  receivePurchaseOrderMock,
  verifyStaffSessionFromRequestMock,
} = vi.hoisted(() => ({
  createPurchaseOrderMock: vi.fn(),
  markOrderedMock: vi.fn(),
  cancelPurchaseOrderMock: vi.fn(),
  receivePurchaseOrderMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/purchaseOrderService', async () => {
  const actual = await vi.importActual<typeof import('@/services/purchaseOrderService')>('@/services/purchaseOrderService');
  return {
    ...actual,
    purchaseOrderService: {
      createPurchaseOrder: createPurchaseOrderMock,
      markOrdered: markOrderedMock,
      cancelPurchaseOrder: cancelPurchaseOrderMock,
      receivePurchaseOrder: receivePurchaseOrderMock,
    },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { POST as createRoute } from '@/app/api/admin/purchase-orders/route';
import { POST as orderRoute } from '@/app/api/admin/purchase-orders/[purchaseOrderId]/order/route';
import { POST as cancelRoute } from '@/app/api/admin/purchase-orders/[purchaseOrderId]/cancel/route';
import { POST as receiveRoute } from '@/app/api/admin/purchase-orders/[purchaseOrderId]/receive/route';
import {
  InvalidPurchaseOrderInputError,
  PurchaseOrderNotFoundError,
  InvalidPurchaseOrderTransitionError,
} from '@/services/purchaseOrderService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/purchase-orders', () => {
  function call(body: unknown) {
    return createRoute(
      new Request('http://localhost/api/admin/purchase-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ supplierId: 's1', lineItems: [{ packageId: 'p1', quantity: 1, unitCostKes: 1 }] });
    expect(response.status).toBe(401);
  });

  it('400s a missing supplierId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ lineItems: [{ packageId: 'p1', quantity: 1, unitCostKes: 1 }] });
    expect(response.status).toBe(400);
  });

  it('400s an empty lineItems array', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ supplierId: 's1', lineItems: [] });
    expect(response.status).toBe(400);
  });

  it('400s a line item missing a numeric quantity', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ supplierId: 's1', lineItems: [{ packageId: 'p1', unitCostKes: 1 }] });
    expect(response.status).toBe(400);
  });

  it('201s and scopes to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createPurchaseOrderMock.mockResolvedValue('po-1');

    const response = await call({ supplierId: 's1', lineItems: [{ packageId: 'p1', quantity: 5, unitCostKes: 100 }] });

    expect(response.status).toBe(201);
    expect(createPurchaseOrderMock).toHaveBeenCalledWith(
      'biz-1',
      { supplierId: 's1', lineItems: [{ packageId: 'p1', quantity: 5, unitCostKes: 100 }], expectedDeliveryAt: undefined, notes: undefined },
      'staff-1',
    );
  });

  it('400s an InvalidPurchaseOrderInputError from the service', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createPurchaseOrderMock.mockRejectedValue(new InvalidPurchaseOrderInputError('bad'));

    const response = await call({ supplierId: 's1', lineItems: [{ packageId: 'p1', quantity: 5, unitCostKes: 100 }] });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/admin/purchase-orders/[purchaseOrderId]/order', () => {
  function call() {
    return orderRoute(new Request('http://localhost/api/admin/purchase-orders/po-1/order', { method: 'POST' }), {
      params: Promise.resolve({ purchaseOrderId: 'po-1' }),
    });
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('200s a valid transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    markOrderedMock.mockResolvedValue(undefined);
    const response = await call();
    expect(response.status).toBe(200);
    expect(markOrderedMock).toHaveBeenCalledWith('biz-1', 'po-1', 'staff-1');
  });

  it('404s an unknown PO', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    markOrderedMock.mockRejectedValue(new PurchaseOrderNotFoundError('po-1'));
    expect((await call()).status).toBe(404);
  });

  it('409s an invalid transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    markOrderedMock.mockRejectedValue(new InvalidPurchaseOrderTransitionError('ordered', 'draft'));
    expect((await call()).status).toBe(409);
  });
});

describe('POST /api/admin/purchase-orders/[purchaseOrderId]/cancel', () => {
  function call(body?: unknown) {
    return cancelRoute(
      new Request('http://localhost/api/admin/purchase-orders/po-1/cancel', {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }),
      { params: Promise.resolve({ purchaseOrderId: 'po-1' }) },
    );
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('200s with no body (reason optional)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    cancelPurchaseOrderMock.mockResolvedValue(undefined);
    const response = await call();
    expect(response.status).toBe(200);
    expect(cancelPurchaseOrderMock).toHaveBeenCalledWith('biz-1', 'po-1', 'staff-1', undefined);
  });

  it('200s with a reason', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    cancelPurchaseOrderMock.mockResolvedValue(undefined);
    const response = await call({ reason: 'no longer needed' });
    expect(response.status).toBe(200);
    expect(cancelPurchaseOrderMock).toHaveBeenCalledWith('biz-1', 'po-1', 'staff-1', 'no longer needed');
  });

  it('409s an invalid transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    cancelPurchaseOrderMock.mockRejectedValue(new InvalidPurchaseOrderTransitionError('received', 'draft or ordered'));
    expect((await call()).status).toBe(409);
  });
});

describe('POST /api/admin/purchase-orders/[purchaseOrderId]/receive', () => {
  function call(body?: unknown) {
    return receiveRoute(
      new Request('http://localhost/api/admin/purchase-orders/po-1/receive', {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }),
      { params: Promise.resolve({ purchaseOrderId: 'po-1' }) },
    );
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('200s with no expiresAtByPackageId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receivePurchaseOrderMock.mockResolvedValue(undefined);
    const response = await call();
    expect(response.status).toBe(200);
    expect(receivePurchaseOrderMock).toHaveBeenCalledWith('biz-1', 'po-1', 'staff-1', {});
  });

  it('200s and passes through expiresAtByPackageId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receivePurchaseOrderMock.mockResolvedValue(undefined);
    const response = await call({ expiresAtByPackageId: { 'pkg-1': '2026-12-31', 'pkg-2': null } });
    expect(response.status).toBe(200);
    expect(receivePurchaseOrderMock).toHaveBeenCalledWith('biz-1', 'po-1', 'staff-1', { 'pkg-1': '2026-12-31', 'pkg-2': null });
  });

  it('409s an invalid transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    receivePurchaseOrderMock.mockRejectedValue(new InvalidPurchaseOrderTransitionError('draft', 'ordered'));
    expect((await call()).status).toBe(409);
  });
});

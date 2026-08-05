import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createFulfillmentBatchMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  createFulfillmentBatchMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/fulfillmentBatchService', async () => {
  const actual = await vi.importActual<typeof import('@/services/fulfillmentBatchService')>('@/services/fulfillmentBatchService');
  return {
    ...actual,
    fulfillmentBatchService: { createFulfillmentBatch: createFulfillmentBatchMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { POST as createRoute } from '@/app/api/admin/fulfillment-batches/route';
import {
  InvalidFulfillmentBatchInputError,
  OrderAlreadyBatchedError,
  OrderNotEligibleForBatchError,
  OrderNotFoundError,
} from '@/services/fulfillmentBatchService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function call(body: unknown) {
  return createRoute(
    new Request('http://localhost/api/admin/fulfillment-batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/fulfillment-batches', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: 100 });
    expect(response.status).toBe(401);
    expect(createFulfillmentBatchMock).not.toHaveBeenCalled();
  });

  it('400s an empty orderIds array', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ orderIds: [], productsPurchasedKes: 100 });
    expect(response.status).toBe(400);
  });

  it('400s a missing productsPurchasedKes', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ orderIds: ['o1'] });
    expect(response.status).toBe(400);
  });

  it('400s a negative productsPurchasedKes', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: -1 });
    expect(response.status).toBe(400);
  });

  it('400s a negative optional cost', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: 100, packagingKes: -5 });
    expect(response.status).toBe(400);
  });

  it('201s and scopes to the session businessId, omitting unset optional costs', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createFulfillmentBatchMock.mockResolvedValue('batch-1');

    const response = await call({ orderIds: ['o1', 'o2'], productsPurchasedKes: 6000, notes: 'Carrefour run' });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.fulfillmentBatchId).toBe('batch-1');
    expect(createFulfillmentBatchMock).toHaveBeenCalledWith(
      'biz-1',
      { orderIds: ['o1', 'o2'], productsPurchasedKes: 6000, packagingKes: undefined, deliveryKes: undefined, miscKes: undefined, notes: 'Carrefour run' },
      'staff-1',
    );
  });

  it('404s when an order does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createFulfillmentBatchMock.mockRejectedValue(new OrderNotFoundError('o1'));
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: 100 });
    expect(response.status).toBe(404);
  });

  it('409s when an order is already batched', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createFulfillmentBatchMock.mockRejectedValue(new OrderAlreadyBatchedError('o1'));
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: 100 });
    expect(response.status).toBe(409);
  });

  it('400s when an order is not eligible', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createFulfillmentBatchMock.mockRejectedValue(new OrderNotEligibleForBatchError('o1', 'cancelled'));
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: 100 });
    expect(response.status).toBe(400);
  });

  it('400s on an invalid-input service error', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createFulfillmentBatchMock.mockRejectedValue(new InvalidFulfillmentBatchInputError('bad input'));
    const response = await call({ orderIds: ['o1'], productsPurchasedKes: 100 });
    expect(response.status).toBe(400);
  });
});

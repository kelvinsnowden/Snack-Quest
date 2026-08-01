import { beforeEach, describe, expect, it, vi } from 'vitest';

const { writeOffBatchMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  writeOffBatchMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/inventoryService', async () => {
  const actual = await vi.importActual<typeof import('@/services/inventoryService')>('@/services/inventoryService');
  return {
    ...actual,
    inventoryService: { writeOffBatch: writeOffBatchMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { POST as writeOffRoute } from '@/app/api/admin/inventory/batches/[batchId]/write-off/route';
import { InventoryBatchNotFoundError, InsufficientBatchQuantityError, InvalidWriteOffQuantityError } from '@/services/inventoryService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function call(body: unknown) {
  return writeOffRoute(
    new Request('http://localhost/api/admin/inventory/batches/batch-1/write-off', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ batchId: 'batch-1' }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/inventory/batches/[batchId]/write-off', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ quantity: 5, reason: 'expired' });
    expect(response.status).toBe(401);
    expect(writeOffBatchMock).not.toHaveBeenCalled();
  });

  it('400s a non-positive quantity', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ quantity: 0, reason: 'expired' });
    expect(response.status).toBe(400);
  });

  it('400s an invalid reason', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ quantity: 5, reason: 'damaged' });
    expect(response.status).toBe(400);
  });

  it('200s a valid write-off, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    writeOffBatchMock.mockResolvedValue({ remaining: 10 });

    const response = await call({ quantity: 5, reason: 'expired', note: 'Past best-before' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ remaining: 10 });
    expect(writeOffBatchMock).toHaveBeenCalledWith('biz-1', 'batch-1', 5, 'expired', 'staff-1', 'Past best-before');
  });

  it('404s an unknown batch', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    writeOffBatchMock.mockRejectedValue(new InventoryBatchNotFoundError('batch-1'));

    const response = await call({ quantity: 5, reason: 'expired' });
    expect(response.status).toBe(404);
  });

  it('409s an insufficient-quantity rejection', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    writeOffBatchMock.mockRejectedValue(new InsufficientBatchQuantityError('batch-1', 5, 2));

    const response = await call({ quantity: 5, reason: 'expired' });
    expect(response.status).toBe(409);
  });

  it('409s an invalid write-off quantity rejection from the service', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    writeOffBatchMock.mockRejectedValue(new InvalidWriteOffQuantityError());

    const response = await call({ quantity: 5, reason: 'expired' });
    expect(response.status).toBe(409);
  });
});

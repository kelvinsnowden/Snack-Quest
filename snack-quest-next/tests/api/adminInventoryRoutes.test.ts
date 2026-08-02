import { describe, expect, it, vi } from 'vitest';

const { adjustStockMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  adjustStockMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/inventoryService', () => ({
  inventoryService: { adjustStock: adjustStockMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as adjustRoute } from '@/app/api/admin/inventory/[packageId]/adjust/route';
import { PackageNotFoundError, StockNotTrackedError, InsufficientStockError } from '@/repositories/packageRepository';

/**
 * Route-handler-level tests for the Admin Inventory adjust endpoint (§
 * Admin: Inventory) — `InventoryService.adjustStock()` itself
 * (transaction correctness, movement recording) is already covered by
 * tests/services/inventoryService.test.ts; these prove the wire: auth
 * gate, input validation, and error-to-status-code mapping.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/inventory/pkg-1/adjust', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function call(body: unknown) {
  return adjustRoute(jsonRequest(body), { params: Promise.resolve({ packageId: 'pkg-1' }) });
}

describe('POST /api/admin/inventory/[packageId]/adjust', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ delta: 5, reason: 'restock' });
    expect(response.status).toBe(401);
    expect(adjustStockMock).not.toHaveBeenCalled();
  });

  it('400s a zero delta', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ delta: 0, reason: 'restock' });
    expect(response.status).toBe(400);
  });

  it('400s a non-integer delta', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ delta: 1.5, reason: 'restock' });
    expect(response.status).toBe(400);
  });

  it('400s an invalid reason', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await call({ delta: 5, reason: 'not-a-real-reason' });
    expect(response.status).toBe(400);
  });

  it('200s a valid adjustment, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adjustStockMock.mockResolvedValue(15);

    const response = await call({ delta: 5, reason: 'restock', note: 'from supplier' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resultingStockCount).toBe(15);
    expect(adjustStockMock).toHaveBeenCalledWith('biz-1', 'pkg-1', 5, 'restock', 'staff-1', 'from supplier');
  });

  it('404s a package the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adjustStockMock.mockRejectedValue(new PackageNotFoundError('pkg-1'));

    const response = await call({ delta: 5, reason: 'restock' });
    expect(response.status).toBe(404);
  });

  it('409s an untracked-stock rejection', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adjustStockMock.mockRejectedValue(new StockNotTrackedError('pkg-1'));

    const response = await call({ delta: 5, reason: 'restock' });
    expect(response.status).toBe(409);
  });

  it('409s an insufficient-stock rejection', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    adjustStockMock.mockRejectedValue(new InsufficientStockError('pkg-1', 5, 2));

    const response = await call({ delta: -5, reason: 'correction' });
    expect(response.status).toBe(409);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupplierMock, updateSupplierMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  createSupplierMock: vi.fn(),
  updateSupplierMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/supplierService', async () => {
  const actual = await vi.importActual<typeof import('@/services/supplierService')>('@/services/supplierService');
  return {
    ...actual,
    supplierService: { createSupplier: createSupplierMock, updateSupplier: updateSupplierMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { POST as createRoute } from '@/app/api/admin/suppliers/route';
import { PATCH as updateRoute } from '@/app/api/admin/suppliers/[supplierId]/route';
import { SupplierNotFoundError, InvalidSupplierInputError } from '@/services/supplierService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/suppliers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/suppliers', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await createRoute(createRequest({ name: 'A', contactName: 'B', phone: '254700000000' }));
    expect(response.status).toBe(401);
    expect(createSupplierMock).not.toHaveBeenCalled();
  });

  it('400s a missing required field', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(createRequest({ name: 'A', contactName: 'B' }));
    expect(response.status).toBe(400);
  });

  it('201s and scopes to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createSupplierMock.mockResolvedValue('supplier-1');

    const response = await createRoute(createRequest({ name: 'A', contactName: 'B', phone: '254700000000' }));

    expect(response.status).toBe(201);
    expect(createSupplierMock).toHaveBeenCalledWith(
      'biz-1',
      { name: 'A', contactName: 'B', phone: '254700000000', email: undefined, notes: undefined },
      'staff-1',
    );
  });

  it('400s an InvalidSupplierInputError from the service', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createSupplierMock.mockRejectedValue(new InvalidSupplierInputError('bad input'));

    const response = await createRoute(createRequest({ name: 'A', contactName: 'B', phone: '254700000000' }));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/admin/suppliers/[supplierId]', () => {
  function call(body: unknown) {
    return updateRoute(
      new Request('http://localhost/api/admin/suppliers/supplier-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ supplierId: 'supplier-1' }) },
    );
  }

  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await call({ isActive: false });
    expect(response.status).toBe(401);
  });

  it('200s a valid patch', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateSupplierMock.mockResolvedValue(undefined);

    const response = await call({ isActive: false });

    expect(response.status).toBe(200);
    expect(updateSupplierMock).toHaveBeenCalledWith('biz-1', 'supplier-1', { isActive: false }, 'staff-1');
  });

  it('404s a supplier the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    updateSupplierMock.mockRejectedValue(new SupplierNotFoundError('supplier-1'));

    const response = await call({ isActive: false });
    expect(response.status).toBe(404);
  });
});

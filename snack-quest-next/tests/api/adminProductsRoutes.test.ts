import { describe, expect, it, vi } from 'vitest';

const { createProductMock, updateProductMock, findByIdMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  updateProductMock: vi.fn(),
  findByIdMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/productService', () => ({
  productService: { createProduct: createProductMock, updateProduct: updateProductMock },
}));

vi.mock('@/repositories/packageRepository', () => ({
  packageRepository: { findById: findByIdMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as createRoute } from '@/app/api/admin/products/route';
import { PATCH as updateRoute } from '@/app/api/admin/products/[packageId]/route';

/**
 * Route-handler-level tests for Admin Products create/update (§ Admin:
 * Products) — `productService` itself (transition logic, catalog
 * sync) is already covered by tests/services/productService.test.ts;
 * these prove the wire: auth gate, validation, and status mapping.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/products', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/products', { name: 'Box', description: 'd', priceKes: 100 }),
    );
    expect(response.status).toBe(401);
    expect(createProductMock).not.toHaveBeenCalled();
  });

  it('400s a missing name', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/products', { description: 'd', priceKes: 100 }),
    );
    expect(response.status).toBe(400);
  });

  it('400s a non-positive price', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/products', { name: 'Box', description: 'd', priceKes: 0 }),
    );
    expect(response.status).toBe(400);
  });

  it('creates a product scoped to the session businessId, omitting stockCount when untracked', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createProductMock.mockResolvedValue('pkg-1');

    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/products', {
        name: 'Deluxe Box',
        description: 'The best box',
        priceKes: 3500,
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.packageId).toBe('pkg-1');
    expect(createProductMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', name: 'Deluxe Box', priceKes: 3500, isActive: true, imageUrl: null }),
      'staff-1',
    );
    const [[input]] = createProductMock.mock.calls;
    expect(input).not.toHaveProperty('stockCount');
  });

  it('includes stockCount when provided as a number', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createProductMock.mockResolvedValue('pkg-2');

    await createRoute(
      jsonRequest('http://localhost/api/admin/products', {
        name: 'Limited Box',
        description: 'Only a few left',
        priceKes: 4000,
        stockCount: 12,
      }),
    );

    expect(createProductMock).toHaveBeenCalledWith(expect.objectContaining({ stockCount: 12 }), 'staff-1');
  });

  it('includes a trimmed snackCountLabel when provided', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createProductMock.mockResolvedValue('pkg-3');

    await createRoute(
      jsonRequest('http://localhost/api/admin/products', {
        name: 'Starter Box',
        description: 'A starter selection',
        priceKes: 2500,
        snackCountLabel: '  10+ snacks  ',
      }),
    );

    expect(createProductMock).toHaveBeenCalledWith(expect.objectContaining({ snackCountLabel: '10+ snacks' }), 'staff-1');
  });

  it('omits snackCountLabel when not provided', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createProductMock.mockResolvedValue('pkg-4');

    await createRoute(
      jsonRequest('http://localhost/api/admin/products', {
        name: 'Deluxe Box',
        description: 'The best box',
        priceKes: 3500,
      }),
    );

    const [[input]] = createProductMock.mock.calls;
    expect(input).not.toHaveProperty('snackCountLabel');
  });

  it('400s a non-string snackCountLabel', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(
      jsonRequest('http://localhost/api/admin/products', {
        name: 'Box',
        description: 'd',
        priceKes: 100,
        snackCountLabel: 42,
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/admin/products/[packageId]', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await updateRoute(jsonRequest('http://localhost/api/admin/products/pkg-1', { isActive: false }), {
      params: Promise.resolve({ packageId: 'pkg-1' }),
    });
    expect(response.status).toBe(401);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it('404s a product that does not belong to the session business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await updateRoute(jsonRequest('http://localhost/api/admin/products/pkg-1', { isActive: false }), {
      params: Promise.resolve({ packageId: 'pkg-1' }),
    });
    expect(response.status).toBe(404);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it('400s an invalid patch value', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue({ businessId: 'biz-1', name: 'Box' });
    const response = await updateRoute(jsonRequest('http://localhost/api/admin/products/pkg-1', { priceKes: -5 }), {
      params: Promise.resolve({ packageId: 'pkg-1' }),
    });
    expect(response.status).toBe(400);
  });

  it('applies a valid partial patch, e.g. deactivating', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock
      .mockResolvedValueOnce({ businessId: 'biz-1', name: 'Box', isActive: true })
      .mockResolvedValueOnce({ businessId: 'biz-1', name: 'Box', isActive: false });
    updateProductMock.mockResolvedValue(undefined);

    const response = await updateRoute(jsonRequest('http://localhost/api/admin/products/pkg-1', { isActive: false }), {
      params: Promise.resolve({ packageId: 'pkg-1' }),
    });

    expect(response.status).toBe(200);
    expect(updateProductMock).toHaveBeenCalledWith('biz-1', 'pkg-1', { isActive: false }, 'staff-1');
  });

  it('400s an empty snackCountLabel', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue({ businessId: 'biz-1', name: 'Box' });
    const response = await updateRoute(
      jsonRequest('http://localhost/api/admin/products/pkg-1', { snackCountLabel: '   ' }),
      { params: Promise.resolve({ packageId: 'pkg-1' }) },
    );
    expect(response.status).toBe(400);
  });

  it('applies a trimmed snackCountLabel patch', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock
      .mockResolvedValueOnce({ businessId: 'biz-1', name: 'Box' })
      .mockResolvedValueOnce({ businessId: 'biz-1', name: 'Box', snackCountLabel: '15+ snacks' });
    updateProductMock.mockResolvedValue(undefined);

    const response = await updateRoute(
      jsonRequest('http://localhost/api/admin/products/pkg-1', { snackCountLabel: ' 15+ snacks ' }),
      { params: Promise.resolve({ packageId: 'pkg-1' }) },
    );

    expect(response.status).toBe(200);
    expect(updateProductMock).toHaveBeenCalledWith('biz-1', 'pkg-1', { snackCountLabel: '15+ snacks' }, 'staff-1');
  });
});

import { describe, expect, it, vi } from 'vitest';

const { createMock, updateMock, findByIdMock, softDeleteMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  findByIdMock: vi.fn(),
  softDeleteMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/repositories/faqRepository', () => ({
  faqRepository: {
    create: createMock,
    update: updateMock,
    findById: findByIdMock,
    softDelete: softDeleteMock,
  },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as createRoute } from '@/app/api/admin/faqs/route';
import { PATCH as patchRoute, DELETE as deleteRoute } from '@/app/api/admin/faqs/[faqId]/route';

/**
 * Route-handler-level tests for Admin FAQ create/update/delete (§
 * Admin: FAQ) — proves the wire: auth gate, validation, and status
 * mapping, mirroring tests/api/adminProductsRoutes.test.ts.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/admin/faqs', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await createRoute(
      jsonRequest('POST', 'http://localhost/api/admin/faqs', { question: 'Q?', answer: 'A' }),
    );
    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('400s a missing question', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(jsonRequest('POST', 'http://localhost/api/admin/faqs', { answer: 'A' }));
    expect(response.status).toBe(400);
  });

  it('400s a missing answer', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await createRoute(jsonRequest('POST', 'http://localhost/api/admin/faqs', { question: 'Q?' }));
    expect(response.status).toBe(400);
  });

  it('creates a FAQ scoped to the session businessId, active by default', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    createMock.mockResolvedValue('faq-1');

    const response = await createRoute(
      jsonRequest('POST', 'http://localhost/api/admin/faqs', { question: '  How do I pay?  ', answer: '  By M-Pesa.  ' }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.faqId).toBe('faq-1');
    expect(createMock).toHaveBeenCalledWith(
      { businessId: 'biz-1', question: 'How do I pay?', answer: 'By M-Pesa.', isActive: true },
      'staff-1',
    );
  });
});

describe('PATCH /api/admin/faqs/[faqId]', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await patchRoute(jsonRequest('PATCH', 'http://localhost/api/admin/faqs/faq-1', { isActive: false }), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });
    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('404s a FAQ that does not belong to the session business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await patchRoute(jsonRequest('PATCH', 'http://localhost/api/admin/faqs/faq-1', { isActive: false }), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });
    expect(response.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('400s an empty question', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue({ businessId: 'biz-1', question: 'Q?', answer: 'A' });
    const response = await patchRoute(jsonRequest('PATCH', 'http://localhost/api/admin/faqs/faq-1', { question: '   ' }), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });
    expect(response.status).toBe(400);
  });

  it('applies a valid partial patch, e.g. hiding it', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock
      .mockResolvedValueOnce({ businessId: 'biz-1', question: 'Q?', answer: 'A', isActive: true })
      .mockResolvedValueOnce({ businessId: 'biz-1', question: 'Q?', answer: 'A', isActive: false });
    updateMock.mockResolvedValue(undefined);

    const response = await patchRoute(jsonRequest('PATCH', 'http://localhost/api/admin/faqs/faq-1', { isActive: false }), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith('faq-1', { isActive: false }, 'staff-1');
  });
});

describe('DELETE /api/admin/faqs/[faqId]', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await deleteRoute(jsonRequest('DELETE', 'http://localhost/api/admin/faqs/faq-1'), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });
    expect(response.status).toBe(401);
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('404s a FAQ that does not belong to the session business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue(null);
    const response = await deleteRoute(jsonRequest('DELETE', 'http://localhost/api/admin/faqs/faq-1'), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });
    expect(response.status).toBe(404);
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('soft-deletes an existing FAQ', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    findByIdMock.mockResolvedValue({ businessId: 'biz-1', question: 'Q?', answer: 'A' });
    softDeleteMock.mockResolvedValue(undefined);

    const response = await deleteRoute(jsonRequest('DELETE', 'http://localhost/api/admin/faqs/faq-1'), {
      params: Promise.resolve({ faqId: 'faq-1' }),
    });

    expect(response.status).toBe(200);
    expect(softDeleteMock).toHaveBeenCalledWith('faq-1', 'staff-1');
  });
});

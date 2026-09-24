import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, testVendMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  testVendMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineService')>('@/services/machineService');
  return { ...actual, machineService: { testVend: testVendMock } };
});

import { POST as testVendPost } from '@/app/api/vending/machines/[id]/testVend/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { TestVendNotSupportedError } from '@/services/machineService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const ADMIN_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const WAREHOUSE_SESSION = { ...ADMIN_SESSION, roles: ['warehouse'] };
const FINANCE_SESSION = { ...ADMIN_SESSION, roles: ['finance'] };

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/vending/machines/m-1/testVend', { method: 'POST', body: JSON.stringify(body) });
}

function callTestVend(body: unknown, id = 'm-1') {
  return testVendPost(postRequest(body), { params: Promise.resolve({ id }) });
}

describe('POST /api/vending/machines/[id]/testVend', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await callTestVend({ slotCode: 'A01' });
    expect(response.status).toBe(401);
    expect(testVendMock).not.toHaveBeenCalled();
  });

  it('403s a warehouse-only session — this action needs admin, unlike the read-only diagnostics', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(WAREHOUSE_SESSION);
    const response = await callTestVend({ slotCode: 'A01' });
    expect(response.status).toBe(403);
    expect(testVendMock).not.toHaveBeenCalled();
  });

  it('403s a finance-only session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await callTestVend({ slotCode: 'A01' });
    expect(response.status).toBe(403);
  });

  it('400s a missing slotCode', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    const response = await callTestVend({});
    expect(response.status).toBe(400);
    expect(testVendMock).not.toHaveBeenCalled();
  });

  it('200s and calls the service with businessId/machineId/slotCode for an admin session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    testVendMock.mockResolvedValue({ vendRef: 'vend-ref-1', authorized: true, reason: null });

    const response = await callTestVend({ slotCode: 'A01' });
    expect(response.status).toBe(200);
    expect(testVendMock).toHaveBeenCalledWith('biz-1', 'm-1', 'A01');
    const body = await response.json();
    expect(body).toEqual({ vendRef: 'vend-ref-1', authorized: true, reason: null });

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'test_vend', entityType: 'machine', machineId: 'm-1', actorId: 'staff-1' });
    expect(logs[0].data.after).toMatchObject({ slotCode: 'A01', vendRef: 'vend-ref-1', authorized: true });
  });

  it('404s a machine that does not exist', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    testVendMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await callTestVend({ slotCode: 'A01' });
    expect(response.status).toBe(404);
  });

  it("409s a manufacturer that doesn't declare vend support", async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    testVendMock.mockRejectedValue(new TestVendNotSupportedError('shengma'));
    const response = await callTestVend({ slotCode: 'A01' });
    expect(response.status).toBe(409);
  });
});

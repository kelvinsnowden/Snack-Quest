import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, startDiagnosticVendMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  startDiagnosticVendMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/machineTransactionService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineTransactionService')>('@/services/machineTransactionService');
  return { ...actual, machineTransactionService: { startDiagnosticVend: startDiagnosticVendMock } };
});

import { POST as testVendPost } from '@/app/api/vending/machines/[id]/testVend/route';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { DiagnosticVendRequestError, SlotUnavailableForSaleError } from '@/services/machineTransactionService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const ADMIN_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const WAREHOUSE_SESSION = { ...ADMIN_SESSION, roles: ['warehouse'] };
const FINANCE_SESSION = { ...ADMIN_SESSION, roles: ['finance'] };
const RESULT = { transactionId: 'diag_1', transactionRef: 'TXN-1', replay: false, authorized: true, commandRef: 'DSP-1', commandStatus: 'sent', failureReason: null };

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

function callTestVend(body: unknown, id = 'm-1') {
  return testVendPost(new Request('http://localhost/api/vending/machines/m-1/testVend', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

describe('POST /api/vending/machines/[id]/testVend', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await callTestVend({ slotCode: 'A01', requestId: 'req-00000001' })).status).toBe(401);
    expect(startDiagnosticVendMock).not.toHaveBeenCalled();
  });

  it('403s a warehouse-only or finance-only session — it really dispenses, so admin only', async () => {
    for (const session of [WAREHOUSE_SESSION, FINANCE_SESSION]) {
      verifyStaffSessionFromRequestMock.mockResolvedValue(session);
      expect((await callTestVend({ slotCode: 'A01', requestId: 'req-00000001' })).status).toBe(403);
    }
    expect(startDiagnosticVendMock).not.toHaveBeenCalled();
  });

  it('400s a missing slotCode or requestId — a vend without an id could not be deduplicated', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    expect((await callTestVend({ requestId: 'req-00000001' })).status).toBe(400);
    expect((await callTestVend({ slotCode: 'A01' })).status).toBe(400);
    expect(startDiagnosticVendMock).not.toHaveBeenCalled();
  });

  it('dispatches through the ledger and audit-logs the first request only', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    startDiagnosticVendMock.mockResolvedValueOnce(RESULT).mockResolvedValueOnce({ ...RESULT, replay: true });

    const first = await callTestVend({ slotCode: 'A01', requestId: 'req-00000001' });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(RESULT);
    expect(startDiagnosticVendMock).toHaveBeenCalledWith({ businessId: 'biz-1', machineId: 'm-1', slotCode: 'A01', requestId: 'req-00000001', actor: 'staff-1' });

    const retry = await callTestVend({ slotCode: 'A01', requestId: 'req-00000001' });
    expect((await retry.json()).replay).toBe(true);

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'test_vend', entityType: 'machine', machineId: 'm-1', actorId: 'staff-1' });
    expect(logs[0].data.after).toMatchObject({ slotCode: 'A01', transactionId: 'diag_1', commandRef: 'DSP-1', authorized: true });
  });

  it('maps errors: unknown machine 404, bad request id 400, unconfigured slot 409', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(ADMIN_SESSION);
    startDiagnosticVendMock.mockRejectedValueOnce(new MachineNotFoundError('m-1'));
    expect((await callTestVend({ slotCode: 'A01', requestId: 'req-00000001' })).status).toBe(404);
    startDiagnosticVendMock.mockRejectedValueOnce(new DiagnosticVendRequestError('bad'));
    expect((await callTestVend({ slotCode: 'A01', requestId: 'x' })).status).toBe(400);
    startDiagnosticVendMock.mockRejectedValueOnce(new SlotUnavailableForSaleError('m-1', 'Z99', 'slot not configured'));
    expect((await callTestVend({ slotCode: 'Z99', requestId: 'req-00000001' })).status).toBe(409);
  });
});

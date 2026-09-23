import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticateDeviceMock, applyVendResultMock, verifyStaffSessionFromRequestMock, listByBusinessMock } = vi.hoisted(() => ({
  authenticateDeviceMock: vi.fn(),
  applyVendResultMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
  listByBusinessMock: vi.fn(),
}));

vi.mock('@/lib/vending/deviceAuth', () => ({
  authenticateDevice: authenticateDeviceMock,
}));

// Only `applyVendResult` is stubbed — a route that reached for
// `createPending`/`markPaymentVerified` on this mock would throw
// "not a function", which is exactly the proof that a device's own
// POST can never create or pay for a transaction (§ financial
// correctness): there is no code path here that could even try.
vi.mock('@/services/machineTransactionService', () => ({
  machineTransactionService: { applyVendResult: applyVendResultMock },
}));

vi.mock('@/repositories/machineTransactionRepository', () => ({
  machineTransactionRepository: { listByBusiness: listByBusinessMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as transactionsPost, GET as transactionsGet } from '@/app/api/vending/transactions/route';
import { UnrecognisedHardwarePayloadError } from '@/lib/vending/hardwareAdapter';
import { MachineNotFoundError } from '@/repositories/machineRepository';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['finance'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/vending/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(query = ''): Request {
  return new Request(`http://localhost/api/vending/transactions${query}`);
}

const VEND_RESULT_PAYLOAD = { vendRef: 'mock-vend-1', dispensed: true, idempotencyKey: 'vend-result-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/vending/transactions', () => {
  it('401s without a valid device credential — a device cannot report a vend result it never authenticated for', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: false, reason: 'unknown_machine' });
    const response = await transactionsPost(postRequest(VEND_RESULT_PAYLOAD));
    expect(response.status).toBe(401);
    expect(applyVendResultMock).not.toHaveBeenCalled();
  });

  it('a malicious or malformed device payload is rejected and never reaches a transaction as a completed sale', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    applyVendResultMock.mockRejectedValue(new UnrecognisedHardwarePayloadError('mock', 'missing vendRef'));

    const response = await transactionsPost(postRequest({ dispensed: true })); // no vendRef, no idempotencyKey
    expect(response.status).toBe(400);
    // The only call the route could possibly make already failed — nothing else in this module can move a transaction to `dispensed`.
    expect(applyVendResultMock).toHaveBeenCalledTimes(1);
  });

  it('200s a legitimate device-authenticated vend result, stamping the actor as the device credential, not a person', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    applyVendResultMock.mockResolvedValue({ applied: true, transactionId: 'txn-1' });

    const response = await transactionsPost(postRequest(VEND_RESULT_PAYLOAD));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(true);
    expect(applyVendResultMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', machineId: 'm-1', actor: 'device:cred-1' }),
    );
  });

  it('404s a report for a machine that no longer exists', async () => {
    authenticateDeviceMock.mockResolvedValue({ ok: true, businessId: 'biz-1', machineId: 'm-1', credentialId: 'cred-1' });
    applyVendResultMock.mockRejectedValue(new MachineNotFoundError('m-1'));
    const response = await transactionsPost(postRequest(VEND_RESULT_PAYLOAD));
    expect(response.status).toBe(404);
  });
});

describe('GET /api/vending/transactions', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await transactionsGet(getRequest());
    expect(response.status).toBe(401);
  });

  it('403s a staff session outside admin/finance/warehouse', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await transactionsGet(getRequest());
    expect(response.status).toBe(403);
  });

  it('200s for finance, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    listByBusinessMock.mockResolvedValue({ transactions: [], nextCursor: null });

    const response = await transactionsGet(getRequest('?machineId=m-1&status=dispensed&limit=10'));
    expect(response.status).toBe(200);
    expect(listByBusinessMock).toHaveBeenCalledWith('biz-1', { machineId: 'm-1', status: 'dispensed', limit: 10, cursor: undefined });
  });

  it('400s an invalid status filter', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await transactionsGet(getRequest('?status=not-a-real-status'));
    expect(response.status).toBe(400);
    expect(listByBusinessMock).not.toHaveBeenCalled();
  });

  it('400s a limit outside the bounded range', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await transactionsGet(getRequest('?limit=5000'));
    expect(response.status).toBe(400);
    expect(listByBusinessMock).not.toHaveBeenCalled();
  });
});

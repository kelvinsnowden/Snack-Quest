import { describe, expect, it, vi } from 'vitest';

const { approveWithdrawalMock, rejectWithdrawalMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  approveWithdrawalMock: vi.fn(),
  rejectWithdrawalMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/withdrawalService', () => ({
  withdrawalService: { approveWithdrawal: approveWithdrawalMock, rejectWithdrawal: rejectWithdrawalMock },
  WithdrawalNotFoundError: class WithdrawalNotFoundError extends Error {},
  InvalidWithdrawalTransitionError: class InvalidWithdrawalTransitionError extends Error {},
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as approveRoute } from '@/app/api/admin/withdrawals/[withdrawalId]/approve/route';
import { POST as rejectRoute } from '@/app/api/admin/withdrawals/[withdrawalId]/reject/route';
import { WithdrawalNotFoundError, InvalidWithdrawalTransitionError } from '@/services/withdrawalService';

/**
 * Route-handler-level tests for the Admin Withdrawals approve/reject
 * endpoints (§ Admin: Withdrawals) — `WithdrawalService` itself is
 * already covered by tests/services/withdrawalService.test.ts; these
 * prove the wire: auth gate, validation, and status mapping.
 */

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function approveRequest() {
  return new Request('http://localhost/api/admin/withdrawals/w1/approve', { method: 'POST' });
}

function rejectRequest(body: unknown) {
  return new Request('http://localhost/api/admin/withdrawals/w1/reject', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/withdrawals/[withdrawalId]/approve', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await approveRoute(approveRequest(), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(401);
    expect(approveWithdrawalMock).not.toHaveBeenCalled();
  });

  it('403s a valid session that only holds the agent role (§ security audit — admin routes must check role, not just session)', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['agent'] });
    const response = await approveRoute(approveRequest(), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(403);
    expect(approveWithdrawalMock).not.toHaveBeenCalled();
  });

  it('200s and reports the resulting status, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveWithdrawalMock.mockResolvedValue('approved');

    const response = await approveRoute(approveRequest(), { params: Promise.resolve({ withdrawalId: 'w1' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('approved');
    expect(approveWithdrawalMock).toHaveBeenCalledWith('biz-1', 'w1', 'staff-1');
  });

  it('404s a withdrawal the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveWithdrawalMock.mockRejectedValue(new WithdrawalNotFoundError('w1'));

    const response = await approveRoute(approveRequest(), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(404);
  });

  it('409s an illegal transition', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    approveWithdrawalMock.mockRejectedValue(new InvalidWithdrawalTransitionError('approved', 'approve'));

    const response = await approveRoute(approveRequest(), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/admin/withdrawals/[withdrawalId]/reject', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await rejectRoute(rejectRequest({ reason: 'x' }), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(401);
    expect(rejectWithdrawalMock).not.toHaveBeenCalled();
  });

  it('403s a valid session that only holds the finance role', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue({ ...STAFF_SESSION, roles: ['finance'] });
    const response = await rejectRoute(rejectRequest({ reason: 'x' }), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(403);
    expect(rejectWithdrawalMock).not.toHaveBeenCalled();
  });

  it('400s a missing reason', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await rejectRoute(rejectRequest({}), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(400);
  });

  it('200s and calls the service with the reason, scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    rejectWithdrawalMock.mockResolvedValue(undefined);

    const response = await rejectRoute(rejectRequest({ reason: 'Could not verify phone' }), {
      params: Promise.resolve({ withdrawalId: 'w1' }),
    });

    expect(response.status).toBe(200);
    expect(rejectWithdrawalMock).toHaveBeenCalledWith('biz-1', 'w1', 'staff-1', 'Could not verify phone');
  });

  it('404s a withdrawal the service reports as not found', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    rejectWithdrawalMock.mockRejectedValue(new WithdrawalNotFoundError('w1'));

    const response = await rejectRoute(rejectRequest({ reason: 'x' }), { params: Promise.resolve({ withdrawalId: 'w1' }) });
    expect(response.status).toBe(404);
  });
});

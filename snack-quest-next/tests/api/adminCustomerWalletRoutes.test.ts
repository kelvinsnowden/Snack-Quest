import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBalanceMock, getLedgerMock, adjustMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  getBalanceMock: vi.fn(),
  getLedgerMock: vi.fn(),
  adjustMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/walletService', async () => {
  const actual = await vi.importActual<typeof import('@/services/walletService')>('@/services/walletService');
  return {
    ...actual,
    walletService: { getBalance: getBalanceMock, getLedger: getLedgerMock, adjust: adjustMock },
  };
});

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: vi.fn() }));

import { GET as getWalletRoute, POST as adjustWalletRoute } from '@/app/api/admin/customers/[phoneNumber]/wallet/route';
import { WalletValidationError } from '@/services/walletService';
import { InsufficientWalletBalanceError } from '@/repositories/customerWalletRepository';

const SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('GET /api/admin/customers/[phoneNumber]/wallet', () => {
  it('401s an unauthenticated request', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await getWalletRoute(new Request('http://localhost/api/admin/customers/254700000001/wallet'), {
      params: Promise.resolve({ phoneNumber: '254700000001' }),
    });
    expect(response.status).toBe(401);
  });

  it('200s with balance + ledger', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    getBalanceMock.mockResolvedValue({ balanceKes: 150, lifetimeCreditsEarnedKes: 200 });
    getLedgerMock.mockResolvedValue([{ id: 'e1', data: { type: 'milestone_bonus', amountKes: 100 } }]);

    const response = await getWalletRoute(new Request('http://localhost/api/admin/customers/254700000001/wallet'), {
      params: Promise.resolve({ phoneNumber: '254700000001' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.balance.balanceKes).toBe(150);
    expect(body.ledger).toHaveLength(1);
    expect(getBalanceMock).toHaveBeenCalledWith('biz-1', '254700000001');
  });
});

describe('POST /api/admin/customers/[phoneNumber]/wallet', () => {
  it('400s a missing field', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    const response = await adjustWalletRoute(jsonRequest('http://localhost/api/admin/customers/254700000001/wallet', { amountKes: 100 }), {
      params: Promise.resolve({ phoneNumber: '254700000001' }),
    });
    expect(response.status).toBe(400);
    expect(adjustMock).not.toHaveBeenCalled();
  });

  it('400s when the service reports a validation error', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    adjustMock.mockRejectedValue(new WalletValidationError('bad input'));
    const response = await adjustWalletRoute(
      jsonRequest('http://localhost/api/admin/customers/254700000001/wallet', { amountKes: 0, note: 'x' }),
      { params: Promise.resolve({ phoneNumber: '254700000001' }) },
    );
    expect(response.status).toBe(400);
  });

  it('400s when the service reports insufficient balance', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    adjustMock.mockRejectedValue(new InsufficientWalletBalanceError('254700000001', 500, 100));
    const response = await adjustWalletRoute(
      jsonRequest('http://localhost/api/admin/customers/254700000001/wallet', { amountKes: -500, note: 'over-debit' }),
      { params: Promise.resolve({ phoneNumber: '254700000001' }) },
    );
    expect(response.status).toBe(400);
  });

  it('200s and calls adjust with the actor uid', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(SESSION);
    adjustMock.mockResolvedValue({ balanceKes: 300, lifetimeCreditsEarnedKes: 300 });
    const response = await adjustWalletRoute(
      jsonRequest('http://localhost/api/admin/customers/254700000001/wallet', { amountKes: 300, note: 'goodwill' }),
      { params: Promise.resolve({ phoneNumber: '254700000001' }) },
    );
    expect(response.status).toBe(200);
    expect(adjustMock).toHaveBeenCalledWith('biz-1', '254700000001', 300, 'goodwill', 'staff-1');
    const body = await response.json();
    expect(body.balance.balanceKes).toBe(300);
  });
});

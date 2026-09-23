import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  findByIdPartnerMock,
  listEarningsLedgerMock,
  listByPartnerSubscriptionsMock,
  listByPartnerSettlementsMock,
  listWithdrawalsForOwnerMock,
  requestWithdrawalMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  findByIdPartnerMock: vi.fn(),
  listEarningsLedgerMock: vi.fn(),
  listByPartnerSubscriptionsMock: vi.fn(),
  listByPartnerSettlementsMock: vi.fn(),
  listWithdrawalsForOwnerMock: vi.fn(),
  requestWithdrawalMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/partnerService', async () => {
  const actual = await vi.importActual<typeof import('@/services/partnerService')>('@/services/partnerService');
  return { ...actual, partnerService: { findById: findByIdPartnerMock } };
});

vi.mock('@/repositories/partnerRepository', async () => {
  const actual = await vi.importActual<typeof import('@/repositories/partnerRepository')>('@/repositories/partnerRepository');
  return { ...actual, listEarningsLedger: listEarningsLedgerMock };
});

vi.mock('@/services/machineSubscriptionService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSubscriptionService')>('@/services/machineSubscriptionService');
  return { ...actual, machineSubscriptionService: { listByPartner: listByPartnerSubscriptionsMock } };
});

vi.mock('@/services/machineSettlementService', async () => {
  const actual = await vi.importActual<typeof import('@/services/machineSettlementService')>('@/services/machineSettlementService');
  return { ...actual, machineSettlementService: { listByPartner: listByPartnerSettlementsMock } };
});

vi.mock('@/services/withdrawalService', async () => {
  const actual = await vi.importActual<typeof import('@/services/withdrawalService')>('@/services/withdrawalService');
  return {
    ...actual,
    withdrawalService: { listWithdrawalsForOwner: listWithdrawalsForOwnerMock, requestWithdrawal: requestWithdrawalMock },
  };
});

import { GET as walletGet } from '@/app/api/vending/partners/[partnerId]/wallet/route';
import { GET as subscriptionsByPartnerGet } from '@/app/api/vending/partners/[partnerId]/subscriptions/route';
import { GET as settlementsByPartnerGet } from '@/app/api/vending/partners/[partnerId]/settlements/route';
import { GET as withdrawalsGet, POST as withdrawalsPost } from '@/app/api/vending/partners/[partnerId]/withdrawals/route';
import { PartnerNotEligibleForWithdrawalError, InsufficientPartnerBalanceError } from '@/services/withdrawalService';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };
const FINANCE_SESSION = { ...STAFF_SESSION, roles: ['finance'] };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const PARTNER = { businessId: 'biz-1', name: 'Owner', contactEmail: null, contactPhone: null, status: 'active', note: null, availableCashKes: 3000, lifetimeEarnedKes: 5000 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/partners/[partnerId]/wallet', () => {
  function get() {
    return walletGet(new Request('http://localhost/x'), { params: Promise.resolve({ partnerId: 'p-1' }) });
  }

  it('401s without a session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it('403s an agent session — partner financials are finance/admin/warehouse only', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    expect((await get()).status).toBe(403);
  });

  it('404s a partner that does not exist in this business', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    findByIdPartnerMock.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it('200s the wallet balance and its backing ledger', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    findByIdPartnerMock.mockResolvedValue(PARTNER);
    listEarningsLedgerMock.mockResolvedValue([
      { type: 'settlement', settlementId: 'settle-1', machineId: 'm-1', amountKes: 2500, createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') } },
    ]);
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.wallet).toEqual(expect.objectContaining({ partnerId: 'p-1', availableCashKes: 3000, lifetimeEarnedKes: 5000 }));
    expect(body.ledger).toEqual([expect.objectContaining({ settlementId: 'settle-1', amountKes: 2500 })]);
  });
});

describe('GET /api/vending/partners/[partnerId]/subscriptions', () => {
  it('200s a partner’s subscriptions across its whole fleet', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listByPartnerSubscriptionsMock.mockResolvedValue([]);
    const response = await subscriptionsByPartnerGet(new Request('http://localhost/x'), { params: Promise.resolve({ partnerId: 'p-1' }) });
    expect(response.status).toBe(200);
    expect(listByPartnerSubscriptionsMock).toHaveBeenCalledWith('biz-1', 'p-1');
  });
});

describe('GET /api/vending/partners/[partnerId]/settlements', () => {
  it('200s a partner’s settlements across its whole fleet', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listByPartnerSettlementsMock.mockResolvedValue([]);
    const response = await settlementsByPartnerGet(new Request('http://localhost/x'), { params: Promise.resolve({ partnerId: 'p-1' }) });
    expect(response.status).toBe(200);
    expect(listByPartnerSettlementsMock).toHaveBeenCalledWith('biz-1', 'p-1');
  });
});

describe('GET /api/vending/partners/[partnerId]/withdrawals', () => {
  it('200s a partner’s withdrawal history', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    listWithdrawalsForOwnerMock.mockResolvedValue({
      withdrawals: [
        {
          id: 'w-1',
          data: {
            ownerId: 'p-1',
            ownerType: 'partner',
            amountKes: 1000,
            status: 'pending',
            createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') },
            paidAt: null,
          },
        },
      ],
      nextCursor: null,
    });
    const response = await withdrawalsGet(new Request('http://localhost/x'), { params: Promise.resolve({ partnerId: 'p-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.withdrawals).toEqual([expect.objectContaining({ id: 'w-1', ownerType: 'partner', amountKes: 1000 })]);
  });
});

describe('POST /api/vending/partners/[partnerId]/withdrawals', () => {
  function post(body: unknown) {
    return withdrawalsPost(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ partnerId: 'p-1' }),
    });
  }

  it('403s a finance-only session — staff-initiated withdrawal requests are ADMIN_ONLY', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(FINANCE_SESSION);
    const response = await post({ amountKes: 1000, phoneNumber: '254712345678' });
    expect(response.status).toBe(403);
  });

  it('400s a missing phoneNumber', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await post({ amountKes: 1000 });
    expect(response.status).toBe(400);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it('201s and requests the withdrawal with ownerType "partner"', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    requestWithdrawalMock.mockResolvedValue('w-1');
    const response = await post({ amountKes: 1000, phoneNumber: '254712345678' });
    expect(response.status).toBe(201);
    expect(requestWithdrawalMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      ownerId: 'p-1',
      ownerType: 'partner',
      amountKes: 1000,
      phoneNumber: '254712345678',
    });
  });

  it('404s an ineligible partner', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    requestWithdrawalMock.mockRejectedValue(new PartnerNotEligibleForWithdrawalError('p-1'));
    const response = await post({ amountKes: 1000, phoneNumber: '254712345678' });
    expect(response.status).toBe(404);
  });

  it('409s an amount exceeding the partner’s available balance', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    requestWithdrawalMock.mockRejectedValue(new InsufficientPartnerBalanceError('p-1', 10_000, 3000));
    const response = await post({ amountKes: 10_000, phoneNumber: '254712345678' });
    expect(response.status).toBe(409);
  });
});

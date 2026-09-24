import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyPartnerSessionFromRequestMock, requestWithdrawalMock, listWithdrawalsForOwnerMock } = vi.hoisted(() => ({
  verifyPartnerSessionFromRequestMock: vi.fn(),
  requestWithdrawalMock: vi.fn(),
  listWithdrawalsForOwnerMock: vi.fn(),
}));

vi.mock('@/lib/auth/partnerSession', () => ({
  verifyPartnerSessionFromRequest: verifyPartnerSessionFromRequestMock,
}));

vi.mock('@/services/withdrawalService', async () => {
  const actual = await vi.importActual<typeof import('@/services/withdrawalService')>('@/services/withdrawalService');
  return {
    ...actual,
    withdrawalService: { requestWithdrawal: requestWithdrawalMock, listWithdrawalsForOwner: listWithdrawalsForOwnerMock },
  };
});

import { GET as withdrawalsGet, POST as withdrawalsPost } from '@/app/api/vending/partners/me/withdrawals/route';
import {
  PartnerNotEligibleForWithdrawalError,
  InsufficientPartnerBalanceError,
  WithdrawalBelowMinimumError,
  WithdrawalAboveMaximumError,
} from '@/services/withdrawalService';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { adminFirestore } from '@/lib/firebase/admin';

/**
 * § PART 2 — OWNER PORTAL, § WITHDRAWAL. The one thing this route
 * exists to guarantee: `ownerId` is always the authenticated
 * partner's own id, never anything the request body could supply —
 * the identity-scoping discipline this route's own doc comment
 * names, proven here by asserting what `requestWithdrawal` was
 * actually called with, not just the response status.
 */
const PARTNER_SESSION = { uid: 'auth-uid-1', partnerId: 'partner-1', businessId: 'biz-1', name: 'Test Owner', contactEmail: 'owner@example.com', status: 'active' as const };

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('auditLogs'));
});

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/vending/partners/me/withdrawals', {
    method: 'POST',
    headers: { cookie: 'sq_partner_session=cookie-value' },
    body: JSON.stringify(body),
  });
}

function getRequest(): Request {
  return new Request('http://localhost/api/vending/partners/me/withdrawals', { headers: { cookie: 'sq_partner_session=cookie-value' } });
}

describe('GET /api/vending/partners/me/withdrawals', () => {
  it('401s without a partner session', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(null);
    const response = await withdrawalsGet(getRequest());
    expect(response.status).toBe(401);
  });

  it("200s the authenticated partner's own withdrawal history, scoped by session partnerId", async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    listWithdrawalsForOwnerMock.mockResolvedValue({
      withdrawals: [{ id: 'w-1', data: { amountKes: 1000, status: 'pending', createdAt: { toDate: () => new Date('2024-01-01T00:00:00.000Z') }, paidAt: null } }],
      nextCursor: null,
    });
    const response = await withdrawalsGet(getRequest());
    expect(response.status).toBe(200);
    expect(listWithdrawalsForOwnerMock).toHaveBeenCalledWith('biz-1', 'partner-1', expect.objectContaining({ cursor: undefined }));
    const body = await response.json();
    expect(body.withdrawals).toEqual([expect.objectContaining({ id: 'w-1', amountKes: 1000, status: 'pending' })]);
  });
});

describe('POST /api/vending/partners/me/withdrawals', () => {
  it('401s without a partner session', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(null);
    const response = await withdrawalsPost(postRequest({ amountKes: 1000, phoneNumber: '0712345678' }));
    expect(response.status).toBe(401);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it('400s a non-positive amountKes before ever calling the service', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    const response = await withdrawalsPost(postRequest({ amountKes: 0, phoneNumber: '0712345678' }));
    expect(response.status).toBe(400);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it('400s an invalid phone number', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    const response = await withdrawalsPost(postRequest({ amountKes: 1000, phoneNumber: 'not-a-phone' }));
    expect(response.status).toBe(400);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it("201s, calls requestWithdrawal with the session's own partnerId as ownerId — never a body-supplied id, and writes a real audit log entry", async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    requestWithdrawalMock.mockResolvedValue('w-1');

    const response = await withdrawalsPost(postRequest({ amountKes: 1000, phoneNumber: '0712345678', ownerId: 'someone-elses-partner-id' }));
    expect(response.status).toBe(201);
    expect(requestWithdrawalMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-1', ownerId: 'partner-1', ownerType: 'partner', amountKes: 1000, phoneNumber: '254712345678' }),
    );

    const { logs } = await auditLogRepository.listByBusiness('biz-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].data).toMatchObject({ action: 'request_withdrawal', entityType: 'withdrawal', entityId: 'w-1', actorId: 'partner-1', source: 'owner_portal' });
    expect(logs[0].data.after).toMatchObject({ ownerId: 'partner-1', ownerType: 'partner', amountKes: 1000 });
  });

  it('404s a partner not eligible for withdrawal', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    requestWithdrawalMock.mockRejectedValue(new PartnerNotEligibleForWithdrawalError('partner-1'));
    const response = await withdrawalsPost(postRequest({ amountKes: 1000, phoneNumber: '0712345678' }));
    expect(response.status).toBe(404);
  });

  it('409s an insufficient balance', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    requestWithdrawalMock.mockRejectedValue(new InsufficientPartnerBalanceError('partner-1', 1000, 500));
    const response = await withdrawalsPost(postRequest({ amountKes: 1000, phoneNumber: '0712345678' }));
    expect(response.status).toBe(409);
  });

  it('400s an amount below the minimum', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    requestWithdrawalMock.mockRejectedValue(new WithdrawalBelowMinimumError(50));
    const response = await withdrawalsPost(postRequest({ amountKes: 50, phoneNumber: '0712345678' }));
    expect(response.status).toBe(400);
  });

  it('400s an amount above the maximum', async () => {
    verifyPartnerSessionFromRequestMock.mockResolvedValue(PARTNER_SESSION);
    requestWithdrawalMock.mockRejectedValue(new WithdrawalAboveMaximumError(999999));
    const response = await withdrawalsPost(postRequest({ amountKes: 999999, phoneNumber: '0712345678' }));
    expect(response.status).toBe(400);
  });
});

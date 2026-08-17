import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestWithdrawalMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  requestWithdrawalMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/withdrawalService', async () => {
  const actual = await vi.importActual<typeof import('@/services/withdrawalService')>('@/services/withdrawalService');
  return {
    ...actual,
    withdrawalService: { requestWithdrawal: requestWithdrawalMock },
  };
});

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
}));

import { POST as withdrawalsRoute } from '@/app/api/creator/withdrawals/route';
import {
  InsufficientCreatorBalanceError,
  CreatorNotEligibleForWithdrawalError,
  WithdrawalBelowMinimumError,
} from '@/services/withdrawalService';

const CREATOR_SESSION = {
  uid: 'creator-1',
  email: 'creator@example.com',
  displayName: 'Creator One',
  businessId: 'biz-1',
  status: 'active' as const,
  onboardingCompleted: true,
};

function request(body: unknown) {
  return new Request('http://localhost/api/creator/withdrawals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { amountKes: 500, phoneNumber: '254712345678' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/creator/withdrawals', () => {
  it('401s without a valid creator session', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
    const response = await withdrawalsRoute(request(VALID_BODY));
    expect(response.status).toBe(401);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it('400s a non-positive amount', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await withdrawalsRoute(request({ ...VALID_BODY, amountKes: 0 }));
    expect(response.status).toBe(400);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it('400s a malformed phone number', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    const response = await withdrawalsRoute(request({ ...VALID_BODY, phoneNumber: '0712345678' }));
    expect(response.status).toBe(400);
    expect(requestWithdrawalMock).not.toHaveBeenCalled();
  });

  it('requests scoped to the session creator, never a client-supplied owner', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    requestWithdrawalMock.mockResolvedValue('withdrawal-1');

    const response = await withdrawalsRoute(request(VALID_BODY));

    expect(response.status).toBe(201);
    expect(requestWithdrawalMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      ownerId: 'creator-1',
      ownerType: 'creator',
      amountKes: 500,
      phoneNumber: '254712345678',
    });
  });

  it('400s InsufficientCreatorBalanceError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    requestWithdrawalMock.mockRejectedValue(new InsufficientCreatorBalanceError('creator-1', 500, 100));

    const response = await withdrawalsRoute(request(VALID_BODY));
    expect(response.status).toBe(400);
  });

  it('400s CreatorNotEligibleForWithdrawalError from the service', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    requestWithdrawalMock.mockRejectedValue(new CreatorNotEligibleForWithdrawalError('creator-1'));

    const response = await withdrawalsRoute(request(VALID_BODY));
    expect(response.status).toBe(400);
  });

  it('400s WithdrawalBelowMinimumError from the service, with the service’s own message', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(CREATOR_SESSION);
    requestWithdrawalMock.mockRejectedValue(new WithdrawalBelowMinimumError(200));

    const response = await withdrawalsRoute(request({ ...VALID_BODY, amountKes: 200 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/minimum/i);
  });
});

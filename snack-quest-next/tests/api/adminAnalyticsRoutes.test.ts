import { describe, expect, it, vi } from 'vitest';

const { setMarketingSpendMock, verifyStaffSessionFromRequestMock } = vi.hoisted(() => ({
  setMarketingSpendMock: vi.fn(),
  verifyStaffSessionFromRequestMock: vi.fn(),
}));

vi.mock('@/services/businessAnalyticsService', () => ({
  businessAnalyticsService: { setMarketingSpend: setMarketingSpendMock },
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

import { POST as marketingSpendRoute } from '@/app/api/admin/analytics/marketing-spend/route';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['admin'], businessId: 'biz-1' };

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/analytics/marketing-spend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/analytics/marketing-spend', () => {
  it('401s without a valid staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await marketingSpendRoute(jsonRequest({ month: '2026-01', amountKes: 5000 }));
    expect(response.status).toBe(401);
    expect(setMarketingSpendMock).not.toHaveBeenCalled();
  });

  it('400s a malformed month', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await marketingSpendRoute(jsonRequest({ month: '2026-1', amountKes: 5000 }));
    expect(response.status).toBe(400);
  });

  it('400s a negative amount', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await marketingSpendRoute(jsonRequest({ month: '2026-01', amountKes: -1 }));
    expect(response.status).toBe(400);
  });

  it('200s and calls the service scoped to the session businessId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    setMarketingSpendMock.mockResolvedValue(undefined);

    const response = await marketingSpendRoute(jsonRequest({ month: '2026-01', amountKes: 5000 }));

    expect(response.status).toBe(200);
    expect(setMarketingSpendMock).toHaveBeenCalledWith('biz-1', '2026-01', 5000, 'staff-1');
  });
});

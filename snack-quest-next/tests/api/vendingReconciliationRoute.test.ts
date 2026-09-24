import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyStaffSessionFromRequestMock, getReconciliationIssuesMock } = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  getReconciliationIssuesMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/vendingReconciliationService', async () => {
  const actual = await vi.importActual<typeof import('@/services/vendingReconciliationService')>('@/services/vendingReconciliationService');
  return { ...actual, vendingReconciliationService: { getReconciliationIssues: getReconciliationIssuesMock } };
});

import { GET as reconciliationGet } from '@/app/api/vending/reconciliation/route';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['finance'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/reconciliation', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await reconciliationGet(new Request('http://localhost/api/vending/reconciliation'));
    expect(response.status).toBe(401);
    expect(getReconciliationIssuesMock).not.toHaveBeenCalled();
  });

  it('403s an agent session — this is finance/warehouse territory, same as the vending transactions/analytics reads', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await reconciliationGet(new Request('http://localhost/api/vending/reconciliation'));
    expect(response.status).toBe(403);
  });

  it("200s the summary, scoped to the session's own businessId", async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    getReconciliationIssuesMock.mockResolvedValue({
      windowDays: 0,
      manualReviewTransactions: [{ transactionId: 'txn-1', machineId: 'm-1', amountKes: 300, status: 'manual_review', failureReason: null, createdAt: '2024-01-01T00:00:00.000Z' }],
      unmatchedVendReports: [],
    });

    const response = await reconciliationGet(new Request('http://localhost/api/vending/reconciliation'));
    expect(response.status).toBe(200);
    expect(getReconciliationIssuesMock).toHaveBeenCalledWith('biz-1');
    const body = await response.json();
    expect(body.summary.manualReviewTransactions).toHaveLength(1);
    expect(body.summary.manualReviewTransactions[0]).toMatchObject({ transactionId: 'txn-1', machineId: 'm-1' });
    expect(body.summary.unmatchedVendReports).toHaveLength(0);
  });
});

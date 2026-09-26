import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  verifyStaffSessionFromRequestMock,
  computeMachineDayMock,
  rebuildMachineDayMock,
  computePartnerDayMock,
  rebuildPartnerDayMock,
  machineListRangeMock,
  partnerListRangeMock,
} = vi.hoisted(() => ({
  verifyStaffSessionFromRequestMock: vi.fn(),
  computeMachineDayMock: vi.fn(),
  rebuildMachineDayMock: vi.fn(),
  computePartnerDayMock: vi.fn(),
  rebuildPartnerDayMock: vi.fn(),
  machineListRangeMock: vi.fn(),
  partnerListRangeMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  verifyStaffSessionFromRequest: verifyStaffSessionFromRequestMock,
}));

vi.mock('@/services/vendingRollupService', () => ({
  vendingRollupService: {
    computeMachineDay: computeMachineDayMock,
    rebuildMachineDay: rebuildMachineDayMock,
    computePartnerDay: computePartnerDayMock,
    rebuildPartnerDay: rebuildPartnerDayMock,
  },
}));

vi.mock('@/repositories/machineDailySummaryRepository', () => ({
  machineDailySummaryRepository: { listRange: machineListRangeMock },
}));

vi.mock('@/repositories/partnerDailySummaryRepository', () => ({
  partnerDailySummaryRepository: { listRange: partnerListRangeMock },
}));

import { GET as analyticsRoute } from '@/app/api/vending/analytics/route';
import { dateKey } from '@/lib/analytics/dateKey';

const STAFF_SESSION = { uid: 'staff-1', email: 'staff@example.com', displayName: 'Staff', roles: ['finance'], businessId: 'biz-1' };
const AGENT_SESSION = { ...STAFF_SESSION, roles: ['agent'] };

const EMPTY_ROLLUP = {
  transactionCount: 0,
  dispensedCount: 0,
  paidVendFailedCount: 0,
  grossSalesKes: 0,
  refundsKes: 0,
  unitsSold: 0,
  averageOrderValueKes: null,
  byProduct: {},
  unpricedUnitsSold: 0,
  stockoutProductIds: [],
  restockCount: 0,
  faultCount: 0,
  heartbeatCount: 0,
};

function get(query: string): Request {
  return new Request(`http://localhost/api/vending/analytics${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/vending/analytics', () => {
  it('401s without a staff session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(null);
    const response = await analyticsRoute(get('?scope=machine&machineId=m-1&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(401);
  });

  it('403s an agent session', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(AGENT_SESSION);
    const response = await analyticsRoute(get('?scope=machine&machineId=m-1&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(403);
  });

  it('400s an invalid scope', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await analyticsRoute(get('?scope=fleet&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(400);
  });

  it('400s a reversed date range', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await analyticsRoute(get('?scope=machine&machineId=m-1&startDate=2024-02-01&endDate=2024-01-01'));
    expect(response.status).toBe(400);
  });

  it('400s a range longer than the maximum', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await analyticsRoute(get('?scope=machine&machineId=m-1&startDate=2020-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(400);
  });

  it('400s scope=machine with no machineId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await analyticsRoute(get('?scope=machine&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(400);
  });

  it('reads a stored completed day without rebuilding it', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const stored = { businessId: 'biz-1', machineId: 'm-1', date: '2024-01-01', ...EMPTY_ROLLUP, grossSalesKes: 350, rebuiltAt: { toDate: () => new Date('2024-01-02T00:00:00.000Z') } };
    machineListRangeMock.mockResolvedValue(new Map([['2024-01-01', stored]]));

    const response = await analyticsRoute(get('?scope=machine&machineId=m-1&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.days['2024-01-01'].grossSalesKes).toBe(350);
    expect(rebuildMachineDayMock).not.toHaveBeenCalled();
  });

  it('self-heals a completed day with no stored rollup, persisting it', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    machineListRangeMock.mockResolvedValue(new Map());
    rebuildMachineDayMock.mockResolvedValue({ ...EMPTY_ROLLUP, grossSalesKes: 700 });

    const response = await analyticsRoute(get('?scope=machine&machineId=m-1&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(200);
    expect(rebuildMachineDayMock).toHaveBeenCalledWith('biz-1', 'm-1', '2024-01-01');
    const body = await response.json();
    expect(body.days['2024-01-01'].grossSalesKes).toBe(700);
  });

  it("computes today live and never persists it", async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const today = dateKey(new Date());
    machineListRangeMock.mockResolvedValue(new Map());
    computeMachineDayMock.mockResolvedValue({ ...EMPTY_ROLLUP, grossSalesKes: 42 });

    const response = await analyticsRoute(get(`?scope=machine&machineId=m-1&startDate=${today}&endDate=${today}`));
    expect(response.status).toBe(200);
    expect(computeMachineDayMock).toHaveBeenCalledWith('biz-1', 'm-1', today);
    expect(rebuildMachineDayMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.days[today].grossSalesKes).toBe(42);
  });

  it('scope=partner sums the portfolio for a completed day via rebuildPartnerDay when uncached', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    partnerListRangeMock.mockResolvedValue(new Map());
    rebuildPartnerDayMock.mockResolvedValue({ machineCount: 2, transactionCount: 3, dispensedCount: 3, grossSalesKes: 1050, refundsKes: 0, faultCount: 0 });

    const response = await analyticsRoute(get('?scope=partner&partnerId=p-1&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(200);
    expect(rebuildPartnerDayMock).toHaveBeenCalledWith('biz-1', 'p-1', '2024-01-01');
    const body = await response.json();
    expect(body.days['2024-01-01'].grossSalesKes).toBe(1050);
    expect(body.days['2024-01-01'].machineCount).toBe(2);
  });

  it('400s scope=partner with no partnerId', async () => {
    verifyStaffSessionFromRequestMock.mockResolvedValue(STAFF_SESSION);
    const response = await analyticsRoute(get('?scope=partner&startDate=2024-01-01&endDate=2024-01-01'));
    expect(response.status).toBe(400);
  });
});

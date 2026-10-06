import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revenue: vi.fn(),
  accounting: vi.fn(),
  pnl: vi.fn(),
  fleet: vi.fn(),
  machines: vi.fn(),
}));
vi.mock('@/services/businessAnalyticsService', () => ({ businessAnalyticsService: { getRevenueOverview: mocks.revenue } }));
vi.mock('@/services/fulfillmentAccountingService', () => ({ fulfillmentAccountingService: { getOverview: mocks.accounting } }));
vi.mock('@/services/machinePnlService', () => ({ machinePnlService: { forMachine: mocks.pnl } }));
vi.mock('@/services/machineDealService', () => ({ machineDealService: { forFleet: mocks.fleet } }));
vi.mock('@/repositories/machineRepository', () => ({ machineRepository: { listAllForBusiness: mocks.machines } }));

import { combinedIncomeService } from '@/services/combinedIncomeService';

/**
 * The combined income view (§ COMBINED INCOME): each line taken from the
 * calculation that owns it, owners' machine sales never counted as Snack
 * Quest's, and revenue without a recorded cost never counted as profit.
 */

const ALL = { website: true, machines: true, deals: true };
const product = (netRevenueKes: number, unpricedNetRevenueKes = 0) => ({ units: netRevenueKes > 0 ? 10 : 0, netRevenueKes, unpricedNetRevenueKes });
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revenue.mockResolvedValue({ totalRevenueKes: 100_000 });
  mocks.accounting.mockResolvedValue({ costed: { grossProfitKes: 30_000 }, uncosted: { orderCount: 2, revenueKes: 10_000 } });
  mocks.machines.mockResolvedValue([{ id: 'own-1' }, { id: 'owner-1' }]);
  mocks.pnl.mockImplementation(async ({ machineId }: { machineId: string }) =>
    machineId === 'own-1'
      ? { product: product(50_000, 2_000), contribution: { contributionProfitKes: 18_000, missing: ['payment_fees'] }, snackQuestIncome: null, estimatedCostUnits: 0 }
      : { product: product(80_000), contribution: { contributionProfitKes: 40_000, missing: [] }, snackQuestIncome: { totalKes: 9_000, maintenanceKes: 1_500, wholesaleUnpricedUnits: 0 }, estimatedCostUnits: 0 },
  );
  mocks.fleet.mockResolvedValue([
    { machineId: 'sold-complete', deal: { sale: { soldOn: today } }, summary: { saleRevenueKes: 470_000, profitKes: 155_000 } },
    { machineId: 'sold-incomplete', deal: { sale: { soldOn: today } }, summary: { saleRevenueKes: 400_000, profitKes: null } },
    { machineId: 'sold-long-ago', deal: { sale: { soldOn: '2020-01-01' } }, summary: { saleRevenueKes: 999_999, profitKes: 500_000 } },
    { machineId: 'unsold', deal: null, summary: { saleRevenueKes: null, profitKes: null } },
  ]);
});

describe('combinedIncomeService.forWindow', () => {
  it('adds each source once, keeps owners’ sales out, and never counts uncosted revenue as profit', async () => {
    const income = await combinedIncomeService.forWindow('biz', 30, ALL);
    const line = (key: string) => income.lines.find((entry) => entry.key === key)!;

    expect(line('website')).toMatchObject({ revenueKes: 100_000, profitKes: 30_000, revenueWithoutCostKes: 10_000 });
    expect(line('own_machines')).toMatchObject({ revenueKes: 50_000, profitKes: 18_000, revenueWithoutCostKes: 2_000 });
    // Only Snack Quest's income from the owner's machine, less the maintenance it paid — never the owner's 80,000 of sales.
    expect(line('owner_machines')).toMatchObject({ revenueKes: null, profitKes: 7_500 });
    expect(line('machine_deals')).toMatchObject({ revenueKes: 870_000, profitKes: 155_000, revenueWithoutCostKes: 400_000 });

    expect(income.totals).toEqual({ revenueKes: 100_000 + 50_000 + 870_000, profitKes: 30_000 + 18_000 + 7_500 + 155_000, revenueWithoutCostKes: 10_000 + 2_000 + 400_000 });
    expect(income.ownersMachineSalesKes).toBe(80_000);
    expect(JSON.stringify(income.totals)).not.toContain('80000');
  });

  it('says when M-Pesa fees are not taken off', async () => {
    const income = await combinedIncomeService.forWindow('biz', 30, ALL);
    expect(income.lines.find((entry) => entry.key === 'own_machines')!.notes.join(' ')).toMatch(/M-Pesa fees are not recorded/);
  });

  it('lines the viewer may not see are left out and named, never silently zero', async () => {
    const income = await combinedIncomeService.forWindow('biz', 30, { website: true, machines: false, deals: false });
    expect(income.lines.map((entry) => entry.key)).toEqual(['website']);
    expect(income.hiddenLines).toEqual(['own_machines', 'owner_machines', 'machine_deals']);
    expect(mocks.pnl).not.toHaveBeenCalled();
    expect(mocks.fleet).not.toHaveBeenCalled();
    expect(income.ownersMachineSalesKes).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { machineDealSummary } from '@/lib/finance/machineDeal';

/** The money on one machine as an asset (§ MACHINE DEALS). A missing cost is never zero. */
describe('machineDealSummary', () => {
  it('profit is the sale (machine + installation charged) less landed and installation cost', () => {
    const summary = machineDealSummary({
      costs: [
        { category: 'purchase', amountKes: 280_000 },
        { category: 'freight', amountKes: 45_000 },
        { category: 'duty_clearing', amountKes: 62_000 },
        { category: 'local_transport', amountKes: 8_000 },
        { category: 'installation', amountKes: 12_000 },
        { category: 'branding', amountKes: 6_000 },
      ],
      noInstallationCost: false,
      sale: { machinePriceKes: 480_000, installationChargeKes: 20_000 },
    });
    expect(summary).toMatchObject({ landedKes: 395_000, installationKes: 18_000, totalCostKes: 413_000, saleRevenueKes: 500_000, profitKes: 87_000, marginPct: 17.4, missing: [] });
  });

  it('no profit figure while the landed cost is missing', () => {
    const summary = machineDealSummary({ costs: [{ category: 'installation', amountKes: 10_000 }], noInstallationCost: false, sale: { machinePriceKes: 400_000, installationChargeKes: 0 } });
    expect(summary.profitKes).toBeNull();
    expect(summary.missing).toEqual(['landed_cost']);
  });

  it('installation must be recorded or stated as none before a profit is shown', () => {
    const base = { costs: [{ category: 'purchase' as const, amountKes: 300_000 }], sale: { machinePriceKes: 400_000, installationChargeKes: 0 } };
    expect(machineDealSummary({ ...base, noInstallationCost: false })).toMatchObject({ profitKes: null, missing: ['installation_cost'] });
    expect(machineDealSummary({ ...base, noInstallationCost: true })).toMatchObject({ profitKes: 100_000, missing: [] });
  });

  it('a loss is shown as a loss', () => {
    expect(machineDealSummary({ costs: [{ category: 'purchase', amountKes: 500_000 }], noInstallationCost: true, sale: { machinePriceKes: 450_000, installationChargeKes: 0 } }).profitKes).toBe(-50_000);
  });

  it('an unsold machine has costs but no sale or profit', () => {
    expect(machineDealSummary({ costs: [{ category: 'purchase', amountKes: 300_000 }], noInstallationCost: true, sale: null })).toMatchObject({ totalCostKes: 300_000, saleRevenueKes: null, profitKes: null });
  });
});

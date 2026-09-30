import { describe, expect, it } from 'vitest';
import { contribution, marginPct, productEconomics, shareOf, unitCostFor, wholesaleMargin } from '@/lib/finance/economics';

/**
 * The only margin definitions in the product. The worked example is the
 * brief's own: landed KES 180, owner price KES 250, retail KES 350.
 */

describe('unitCostFor', () => {
  const snapshot = { landedCostKes: 180, ownerWholesaleKes: 250 };
  it('Snack Quest always costs at its landed cost', () => {
    expect(unitCostFor({ ...snapshot, ownerCostBasis: 'wholesale_price' }, 'snack_quest')).toBe(180);
  });
  it('an owner on wholesale pricing costs at what they paid', () => {
    expect(unitCostFor({ ...snapshot, ownerCostBasis: 'wholesale_price' }, 'owner')).toBe(250);
  });
  it('an owner on landed-cost terms costs at the landed cost (the original settlement rule)', () => {
    expect(unitCostFor({ ...snapshot, ownerCostBasis: 'landed_cost' }, 'owner')).toBe(180);
  });
  it('a missing wholesale price stays unknown — never replaced by the landed cost', () => {
    expect(unitCostFor({ landedCostKes: 180, ownerWholesaleKes: null, ownerCostBasis: 'wholesale_price' }, 'owner')).toBeNull();
  });
});

describe('productEconomics', () => {
  it('the brief’s example: owner sells at 350 bought at 250 — 100 profit, 28.6%', () => {
    const result = productEconomics([{ units: 1, grossKes: 350, unitCostKes: 250 }]);
    expect(result).toMatchObject({ netRevenueKes: 350, cogsKes: 250, grossProfitKes: 100, grossMarginPct: 28.6 });
  });

  it('combined economics: 350 − 180 = 170', () => {
    expect(productEconomics([{ units: 1, grossKes: 350, unitCostKes: 180 }]).grossProfitKes).toBe(170);
  });

  it('discounts and refunds come off revenue before profit', () => {
    const result = productEconomics([
      { units: 2, grossKes: 700, discountKes: 50, unitCostKes: 250 },
      { units: 1, grossKes: 350, refundKes: 350, unitCostKes: 250 },
    ]);
    expect(result).toMatchObject({ grossRevenueKes: 1050, discountsKes: 50, refundsKes: 350, netRevenueKes: 650, cogsKes: 750, grossProfitKes: -100 });
  });

  it('a sale with no known cost is counted and reported, not costed at zero', () => {
    const result = productEconomics([
      { units: 1, grossKes: 350, unitCostKes: 250 },
      { units: 3, grossKes: 900, unitCostKes: null },
    ]);
    expect(result).toMatchObject({ netRevenueKes: 1250, cogsKes: 250, costedNetRevenueKes: 350, grossProfitKes: 100, grossMarginPct: 28.6, unpricedUnits: 3, unpricedNetRevenueKes: 900 });
  });

  it('no sales: zeros and no margin (never a division by zero)', () => {
    expect(productEconomics([])).toMatchObject({ units: 0, netRevenueKes: 0, grossProfitKes: 0, grossMarginPct: null });
  });
});

describe('contribution', () => {
  it('Snack Quest machine example from the brief: 150,000 revenue → 47,000 contribution', () => {
    const product = productEconomics([{ units: 1, grossKes: 150_000, unitCostKes: 80_000 }]);
    const result = contribution(product, { paymentFeesKes: 3_000, locationCommissionKes: 15_000, maintenanceKes: 5_000 });
    expect(result.contributionProfitKes).toBe(47_000);
    expect(result.contributionMarginPct).toBe(31.3);
    expect(result.missing).toEqual([]);
  });

  it('an unknown cost is left out and named, never assumed zero', () => {
    const product = productEconomics([{ units: 1, grossKes: 1000, unitCostKes: 600 }]);
    const result = contribution(product, { paymentFeesKes: null, locationCommissionKes: null });
    expect(result.contributionProfitKes).toBe(400);
    expect(result.missing).toEqual(['payment_fees', 'location_commission']);
    expect(result.lines.find((line) => line.key === 'payment_fees')?.amountKes).toBeNull();
  });

  it('advertising revenue adds; costs subtract', () => {
    const product = productEconomics([{ units: 1, grossKes: 1000, unitCostKes: 600 }]);
    expect(contribution(product, { paymentFeesKes: 0, locationCommissionKes: 0, subscriptionKes: 100, adRevenueKes: 250 }).contributionProfitKes).toBe(550);
  });
});

describe('wholesaleMargin', () => {
  it('Snack Quest earns 250 − 180 = 70 per unit sold to an owner', () => {
    expect(wholesaleMargin([{ units: 10, ownerWholesaleKes: 250, landedCostKes: 180 }])).toMatchObject({ wholesaleRevenueKes: 2500, landedCostKes: 1800, marginKes: 700, marginPct: 28 });
  });
  it('units missing a price are counted separately', () => {
    expect(wholesaleMargin([{ units: 2, ownerWholesaleKes: null, landedCostKes: 180 }])).toMatchObject({ units: 0, unpricedUnits: 2, marginPct: null });
  });
});

describe('helpers', () => {
  it('marginPct rounds to one decimal and refuses zero revenue', () => {
    expect(marginPct(1, 3)).toBe(33.3);
    expect(marginPct(10, 0)).toBeNull();
  });
  it('shareOf: 40% of 20,000 advertising revenue is 8,000', () => {
    expect(shareOf(20_000, 40)).toBe(8_000);
    expect(shareOf(20_000, 60)).toBe(12_000);
  });
});

import { describe, expect, it } from 'vitest';
import { orderBoxSummary, orderLines, totalBoxCount } from '@/types/checkoutLine';

/**
 * Reading an order's boxes, whichever shape it was written in
 * (§ more than one box per order).
 *
 * The case that matters is the old one. There are real, paid orders in
 * production with no `items` at all, and every packing surface reads
 * through here — an old order that returned no lines would be a box
 * that never gets packed.
 */
describe('orderLines', () => {
  it('reconstructs the single line of an order written before line items existed', () => {
    expect(orderLines({ packageId: 'pkg-1', packageLabel: 'Starter Box', quantity: 2 })).toEqual([
      { packageId: 'pkg-1', packageLabel: 'Starter Box', quantity: 2, unitPriceKes: 0 },
    ]);
  });

  /** A WhatsApp order records no quantity at all, and means one. */
  it('treats a missing quantity as one, never as none', () => {
    expect(orderLines({ packageId: 'pkg-1', packageLabel: 'Starter Box' })[0].quantity).toBe(1);
  });

  it('returns every line when the order has them', () => {
    const items = [
      { packageId: 'pkg-1', packageLabel: 'Starter Box', quantity: 1, unitPriceKes: 2500 },
      { packageId: 'pkg-2', packageLabel: 'Deluxe Box', quantity: 2, unitPriceKes: 3500 },
    ];
    expect(orderLines({ items, packageId: 'pkg-1', packageLabel: 'Starter Box', quantity: 1 })).toEqual(items);
  });

  it('counts every box a courier is handed', () => {
    expect(
      totalBoxCount([
        { packageId: 'a', packageLabel: 'A', quantity: 1, unitPriceKes: 1 },
        { packageId: 'b', packageLabel: 'B', quantity: 3, unitPriceKes: 1 },
      ]),
    ).toBe(4);
  });
});

describe('orderBoxSummary', () => {
  /** "1 × Starter Box" would be noise on the overwhelmingly common order. */
  it('names a single box plainly, with no count', () => {
    expect(orderBoxSummary({ packageId: 'pkg-1', packageLabel: 'Starter Box', quantity: 1 })).toBe(
      'Starter Box',
    );
  });

  it('spells out every box when there is more than one', () => {
    expect(
      orderBoxSummary({
        packageId: 'pkg-1',
        packageLabel: 'Starter Box',
        quantity: 1,
        items: [
          { packageId: 'pkg-1', packageLabel: 'Starter Box', quantity: 1, unitPriceKes: 2500 },
          { packageId: 'pkg-2', packageLabel: 'Deluxe Box', quantity: 2, unitPriceKes: 3500 },
        ],
      }),
    ).toBe('1 × Starter Box + 2 × Deluxe Box');
  });
});

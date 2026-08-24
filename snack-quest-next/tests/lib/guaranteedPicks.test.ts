import { describe, expect, it } from 'vitest';
import {
  guaranteedPickCountFor,
  isSelectableSnack,
  offersGuaranteedPicks,
  validateGuaranteedPicks,
} from '@/lib/packages/guaranteedPicks';
import type { SnackItem } from '@/types';

/**
 * The rules behind "choose 5, discover the rest" (§ Premium).
 *
 * These matter more than most pure functions here because they are the
 * server's answer to a request it does not trust: the client sends
 * snack ids, and everything that ends up on a packing list is decided
 * by `validateGuaranteedPicks` reading the real catalogue.
 */

const BUSINESS_ID = 'biz-picks';

function snack(overrides: Partial<SnackItem> = {}): SnackItem {
  return {
    businessId: BUSINESS_ID,
    name: 'Calbee Shrimp Chips 70g',
    imageUrl: null,
    expectedUnitCostKes: 120,
    unitLabel: 'bag',
    origin: 'Japan',
    sourcingNote: null,
    isActive: true,
    availableForPremiumSelection: true,
    createdAt: null,
    updatedAt: null,
    createdBy: 'test',
    updatedBy: 'test',
    ...overrides,
  } as unknown as SnackItem;
}

const PREMIUM = { guaranteedPickCount: 5 };
const STANDARD = { guaranteedPickCount: undefined };

describe('which boxes offer picks', () => {
  it('treats a box without a count as fully curated', () => {
    expect(offersGuaranteedPicks(STANDARD)).toBe(false);
    expect(guaranteedPickCountFor(STANDARD)).toBe(0);
    expect(offersGuaranteedPicks({ guaranteedPickCount: 0 })).toBe(false);
  });

  it('reads the count off the box rather than assuming five', () => {
    expect(guaranteedPickCountFor({ guaranteedPickCount: 3 })).toBe(3);
    expect(offersGuaranteedPicks(PREMIUM)).toBe(true);
  });
});

describe('which snacks may be offered', () => {
  it('offers an active, opted-in snack', () => {
    expect(isSelectableSnack(snack())).toBe(true);
  });

  it('never offers one an admin has not opted in', () => {
    expect(isSelectableSnack(snack({ availableForPremiumSelection: false }))).toBe(false);
    expect(isSelectableSnack(snack({ availableForPremiumSelection: undefined }))).toBe(false);
  });

  it('never offers a retired snack', () => {
    expect(isSelectableSnack(snack({ isActive: false }))).toBe(false);
  });

  /**
   * Untracked is not zero. Most of this catalogue has never been
   * counted, and treating absent as "out of stock" would empty the
   * picker entirely.
   */
  it('offers an uncounted snack but not one counted down to zero', () => {
    expect(isSelectableSnack(snack({ stockCount: undefined }))).toBe(true);
    expect(isSelectableSnack(snack({ stockCount: 3 }))).toBe(true);
    expect(isSelectableSnack(snack({ stockCount: 0 }))).toBe(false);
  });
});

describe('validating what a client sent', () => {
  const catalogue = new Map<string, SnackItem>([
    ['a', snack({ name: 'A' })],
    ['b', snack({ name: 'B' })],
    ['c', snack({ name: 'C' })],
    ['d', snack({ name: 'D' })],
    ['e', snack({ name: 'E' })],
    ['gone', snack({ name: 'Gone', stockCount: 0 })],
    ['private', snack({ name: 'Bulk sugar', availableForPremiumSelection: false })],
    ['other-tenant', snack({ name: 'Someone else’s', businessId: 'another-business' })],
  ]);

  it('accepts exactly the required number and copies what the box needs', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ['a', 'b', 'c', 'd', 'e'], catalogue);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picks).toHaveLength(5);
    // Denormalised at purchase time, so a later rename cannot rewrite
    // what the customer was promised.
    expect(result.picks[0]).toMatchObject({ snackItemId: 'a', name: 'A', origin: 'Japan' });
  });

  it.each<{ ids: string[] | undefined; label: string }>([
    { ids: ['a', 'b', 'c', 'd'], label: 'too few' },
    { ids: ['a', 'b', 'c', 'd', 'e', 'a'], label: 'too many' },
    { ids: undefined, label: 'none at all' },
  ])('refuses a request with $label', ({ ids }) => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ids, catalogue);
    expect(result.ok).toBe(false);
  });

  /**
   * Five ids where two are the same is not five picks. Collapsing it
   * silently would hand the customer four chosen snacks and no
   * explanation.
   */
  it('refuses a duplicate rather than quietly de-duplicating it', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ['a', 'a', 'b', 'c', 'd'], catalogue);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/different snack/);
  });

  it('refuses a snack that has run out', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ['a', 'b', 'c', 'd', 'gone'], catalogue);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Gone');
  });

  /** The whole point of validating server-side: the picker never offers this one. */
  it('refuses a snack the customer was never offered', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ['a', 'b', 'c', 'd', 'private'], catalogue);
    expect(result.ok).toBe(false);
  });

  it('refuses a snack belonging to another business', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ['a', 'b', 'c', 'd', 'other-tenant'], catalogue);
    expect(result.ok).toBe(false);
  });

  it('refuses an id that does not exist at all', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, PREMIUM, ['a', 'b', 'c', 'd', 'nope'], catalogue);
    expect(result.ok).toBe(false);
  });

  /**
   * A fully-curated box has nothing to pick, so stray ids are ignored
   * rather than failing a checkout over a field that changes nothing.
   */
  it('ignores picks sent for a box that does not offer any', () => {
    const result = validateGuaranteedPicks(BUSINESS_ID, STANDARD, ['a', 'b'], catalogue);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.picks).toEqual([]);
  });
});

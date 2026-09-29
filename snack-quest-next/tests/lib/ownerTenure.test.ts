import { describe, expect, it } from 'vitest';
import {
  clipStartDate,
  firstOwnedDayKey,
  withinTenure,
} from '@/lib/vending/ownerTenure';

/** What a new owner may see of a machine's past: nothing before the handover, and not the handover day's mixed rollup. */
describe('owner tenure', () => {
  it('starts rollups on the first whole day after the handover', () => {
    expect(firstOwnedDayKey(null)).toBeNull();
    expect(firstOwnedDayKey(new Date('2026-09-10T08:30:00Z'))).toBe(
      '2026-09-11',
    );
    expect(firstOwnedDayKey(new Date('2026-09-10T00:00:00Z'))).toBe(
      '2026-09-10',
    );
    expect(firstOwnedDayKey(new Date('2026-12-31T23:59:59Z'))).toBe(
      '2027-01-01',
    );
  });

  it('only ever moves a window start forward', () => {
    const since = new Date('2026-09-10T08:30:00Z');
    expect(clipStartDate('2026-09-01', since)).toBe('2026-09-11');
    expect(clipStartDate('2026-09-20', since)).toBe('2026-09-20');
    expect(clipStartDate('2026-09-01', null)).toBe('2026-09-01');
  });

  it('includes moments at or after the handover only', () => {
    const since = new Date('2026-09-10T08:30:00Z');
    expect(withinTenure(new Date('2026-09-10T08:29:59Z'), since)).toBe(false);
    expect(withinTenure(new Date('2026-09-10T08:30:00Z'), since)).toBe(true);
    expect(withinTenure({ toMillis: () => since.getTime() + 1 }, since)).toBe(
      true,
    );
    expect(withinTenure(null, since)).toBe(false);
    expect(withinTenure(null, null)).toBe(true);
  });
});

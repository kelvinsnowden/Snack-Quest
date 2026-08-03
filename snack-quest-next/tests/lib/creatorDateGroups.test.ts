import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { groupByDateLabel } from '@/lib/creator/dateGroups';

function ts(msAgo: number): { toDate: () => Date } {
  return Timestamp.fromMillis(Date.now() - msAgo);
}

const DAY = 24 * 60 * 60 * 1000;

describe('groupByDateLabel', () => {
  it('groups same-day items under a single "Today" section', () => {
    const items = [{ createdAt: ts(0) }, { createdAt: ts(60_000) }];
    const groups = groupByDateLabel(items, (i) => i.createdAt);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].items).toHaveLength(2);
  });

  it('separates Today from Yesterday from an older date', () => {
    const items = [
      { createdAt: ts(0) },
      { createdAt: ts(DAY + 60_000) },
      { createdAt: ts(3 * DAY) },
    ];
    const groups = groupByDateLabel(items, (i) => i.createdAt);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', groups[2].label]);
    expect(groups[2].label).not.toBe('Today');
    expect(groups[2].label).not.toBe('Yesterday');
  });

  it('keeps insertion order and does not merge non-adjacent same-label runs', () => {
    // Descending order is assumed, so this shape (older, newer, older) never
    // happens in real data — this just proves adjacency, not full re-sorting.
    const items = [{ createdAt: ts(0) }, { createdAt: ts(3 * DAY) }, { createdAt: ts(0) }];
    const groups = groupByDateLabel(items, (i) => i.createdAt);
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe('Today');
    expect(groups[2].label).toBe('Today');
  });

  it('labels a missing/null date as "Unknown date"', () => {
    const groups = groupByDateLabel([{ createdAt: null }], (i) => i.createdAt);
    expect(groups[0].label).toBe('Unknown date');
  });

  it('accepts an ISO string, matching a Timestamp for the same instant', () => {
    const iso = new Date().toISOString();
    const groups = groupByDateLabel([{ createdAt: iso }], (i) => i.createdAt);
    expect(groups[0].label).toBe('Today');
  });
});

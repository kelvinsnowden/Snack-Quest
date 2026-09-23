import { describe, expect, it } from 'vitest';
import { resolveTrafficRange } from '@/lib/analytics/trafficRange';

/**
 * `resolveTrafficRange` (§ Admin: Analytics, website traffic filter) —
 * pure date math turning the day/week/month/custom query params into a
 * concrete window, no Firestore involved.
 */
describe('resolveTrafficRange', () => {
  /*
   * `start` is midnight-aligned rather than an exact "now minus 30
   * days" instant (§ analytics rollups): the traffic rollups this
   * feeds are one document per calendar day, so the window has to
   * cover exactly 30 calendar days — today and the 29 before it — or
   * the analytics service would silently read one extra day's worth
   * of rollups at the boundary.
   */
  it('defaults to the last 30 calendar days when no range is given', () => {
    const range = resolveTrafficRange({});

    expect(range.key).toBe('month');
    expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
    expect(range.start.getUTCHours()).toBe(0);
    expect(range.start.getUTCMinutes()).toBe(0);
    const days =
      (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000);
    // 29 full days plus however much of today has elapsed — so it
    // sits in (29, 30], never at exactly 30 and never below 29.
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('resolves "day" to the start of today through now', () => {
    const range = resolveTrafficRange({ range: 'day' });

    expect(range.key).toBe('day');
    expect(range.start.getUTCHours()).toBe(0);
    expect(range.start.getUTCMinutes()).toBe(0);
    expect(range.label).toBe('Today');
  });

  it('resolves "week" to exactly 7 calendar days, midnight-aligned', () => {
    const range = resolveTrafficRange({ range: 'week' });

    expect(range.key).toBe('week');
    expect(range.start.getUTCHours()).toBe(0);
    expect(range.start.getUTCMinutes()).toBe(0);
    const days = (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  /*
   * The specific bug this guards: flooring an unaligned "now - 7 days"
   * instant down to midnight adds a day rather than trimming one, so
   * a window spans 8 calendar days instead of 7. Asserted directly in
   * the unit this data actually gets consumed by — calendar-day keys —
   * rather than only in elapsed milliseconds.
   */
  it('spans exactly 7 distinct calendar days', () => {
    const range = resolveTrafficRange({ range: 'week' });
    const dateKeys = new Set<string>();
    for (let ms = range.start.getTime(); ms < range.end.getTime(); ms += 24 * 60 * 60 * 1000) {
      dateKeys.add(new Date(ms).toISOString().slice(0, 10));
    }
    dateKeys.add(new Date(range.end.getTime() - 1).toISOString().slice(0, 10));
    expect(dateKeys.size).toBe(7);
  });

  it('resolves a valid custom range inclusive of both dates', () => {
    const range = resolveTrafficRange({ range: 'custom', from: '2026-08-01', to: '2026-08-03' });

    expect(range.key).toBe('custom');
    expect(range.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(range.label).toBe('2026-08-01 – 2026-08-03');
  });

  it('clamps a custom range whose "to" date is in the future to now', () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const range = resolveTrafficRange({ range: 'custom', from: '2026-01-01', to: farFuture });

    expect(range.end.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('falls back to the default when "from" is after "to"', () => {
    const range = resolveTrafficRange({ range: 'custom', from: '2026-08-10', to: '2026-08-01' });

    expect(range.key).toBe('month');
  });

  it('falls back to the default when a custom date is malformed', () => {
    const range = resolveTrafficRange({ range: 'custom', from: 'not-a-date', to: '2026-08-01' });

    expect(range.key).toBe('month');
  });

  it('falls back to the default for an unrecognized range key', () => {
    const range = resolveTrafficRange({ range: 'decade' });

    expect(range.key).toBe('month');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveTrafficRange } from '@/lib/analytics/trafficRange';

/**
 * `resolveTrafficRange` (§ Admin: Analytics, website traffic filter) —
 * pure date math turning the day/week/month/custom query params into a
 * concrete window, no Firestore involved.
 */
describe('resolveTrafficRange', () => {
  it('defaults to the last 30 days when no range is given', () => {
    const range = resolveTrafficRange({});

    expect(range.key).toBe('month');
    expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
    const days = (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(30, 1);
  });

  it('resolves "day" to the start of today through now', () => {
    const range = resolveTrafficRange({ range: 'day' });

    expect(range.key).toBe('day');
    expect(range.start.getUTCHours()).toBe(0);
    expect(range.start.getUTCMinutes()).toBe(0);
    expect(range.label).toBe('Today');
  });

  it('resolves "week" to a rolling 7-day window', () => {
    const range = resolveTrafficRange({ range: 'week' });

    const days = (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000);
    expect(range.key).toBe('week');
    expect(days).toBeCloseTo(7, 1);
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

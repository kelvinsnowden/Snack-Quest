/**
 * Resolves the admin Analytics page's day/week/month/custom-range
 * traffic filter (§ Admin: Analytics, website traffic) from URL query
 * params into a concrete `{ start, end }` window. Pure date math, no
 * Firestore — kept separate from `businessAnalyticsService` so the
 * page (which needs the resolved range to render the filter pills and
 * section labels) and the service (which only needs the window) don't
 * have to agree on query-param shape.
 */

export type TrafficRangeKey = 'day' | 'week' | 'month' | 'custom';

export interface ResolvedTrafficRange {
  key: TrafficRangeKey;
  start: Date;
  end: Date;
  label: string;
}

export interface TrafficRangeSearchParams {
  range?: string;
  from?: string;
  to?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: string): Date | null {
  if (!DATE_PARAM_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Midnight, `days` calendar days before `now` — including `now`'s own
 * day, so this is "today and the `days - 1` days before it"
 * (§ analytics rollups).
 *
 * Deliberately not `now - days * DAY_MS`: the traffic analytics this
 * feeds are computed from one rollup document per calendar day, so a
 * window has to end on a day boundary or it silently pulls in a whole
 * extra day's traffic at the start — the fraction of "now"'s own day
 * that a raw millisecond subtraction doesn't reach rounds down to the
 * *previous* midnight, adding a day rather than trimming one. Anchoring
 * to `days - 1` days back, at midnight, is what makes "last 7 days"
 * mean exactly seven calendar days rather than eight.
 */
function daysAgoAtMidnight(now: Date, days: number): Date {
  const anchor = new Date(now.getTime() - (days - 1) * DAY_MS);
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
}

export function resolveTrafficRange(params: TrafficRangeSearchParams): ResolvedTrafficRange {
  const now = new Date();

  if (params.range === 'day') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { key: 'day', start, end: now, label: 'Today' };
  }

  if (params.range === 'week') {
    return { key: 'week', start: daysAgoAtMidnight(now, 7), end: now, label: 'Last 7 days' };
  }

  if (params.range === 'custom' && params.from && params.to) {
    const from = parseDateParam(params.from);
    const to = parseDateParam(params.to);
    if (from && to && from.getTime() <= to.getTime()) {
      const end = new Date(to.getTime() + DAY_MS);
      return {
        key: 'custom',
        start: from,
        end: end.getTime() > now.getTime() ? now : end,
        label: params.from === params.to ? params.from : `${params.from} – ${params.to}`,
      };
    }
  }

  return { key: 'month', start: daysAgoAtMidnight(now, 30), end: now, label: 'Last 30 days' };
}

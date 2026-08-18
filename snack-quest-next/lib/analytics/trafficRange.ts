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

export function resolveTrafficRange(params: TrafficRangeSearchParams): ResolvedTrafficRange {
  const now = new Date();

  if (params.range === 'day') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { key: 'day', start, end: now, label: 'Today' };
  }

  if (params.range === 'week') {
    return { key: 'week', start: new Date(now.getTime() - 7 * DAY_MS), end: now, label: 'Last 7 days' };
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

  return { key: 'month', start: new Date(now.getTime() - 30 * DAY_MS), end: now, label: 'Last 30 days' };
}

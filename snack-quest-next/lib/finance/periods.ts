/**
 * Reporting periods in Nairobi time (§ OWNER PROFITABILITY: today,
 * yesterday, 7 days, 30 days, this month, last month, custom). Nairobi is
 * UTC+3 all year, with no daylight saving, so a business day is a fixed
 * 24-hour span.
 */

export const PERIOD_PRESETS = ['today', 'yesterday', '7d', '30d', 'this_month', 'last_month', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  custom: 'Custom',
};

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface ReportingPeriod {
  preset: PeriodPreset;
  /** Inclusive start. */
  start: Date;
  /** Exclusive end. */
  end: Date;
  /** Nairobi dates, inclusive: `YYYY-MM-DD`. */
  fromKey: string;
  toKey: string;
  days: number;
}

/** Midnight in Nairobi of the Nairobi date `key`, as an instant. */
function startOfKey(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - OFFSET_MS);
}

/** The Nairobi date of an instant. */
export function nairobiDateKey(at: Date): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

function shiftKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function period(preset: PeriodPreset, fromKey: string, toKey: string): ReportingPeriod {
  const start = startOfKey(fromKey);
  const end = startOfKey(shiftKey(toKey, 1));
  return { preset, start, end, fromKey, toKey, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) };
}

/**
 * Resolves a preset (or a custom `from`/`to`, Nairobi dates) to a period.
 * An unknown preset falls back to 30 days; a custom range must be valid,
 * in order and at most 366 days, otherwise it falls back too — a report
 * never runs on a range nobody asked for silently widening.
 */
export function resolvePeriod(input: { preset?: string | null; from?: string | null; to?: string | null }, now = new Date()): ReportingPeriod {
  const today = nairobiDateKey(now);
  const preset = (PERIOD_PRESETS as readonly string[]).includes(input.preset ?? '') ? (input.preset as PeriodPreset) : '30d';
  switch (preset) {
    case 'today':
      return period('today', today, today);
    case 'yesterday':
      return period('yesterday', shiftKey(today, -1), shiftKey(today, -1));
    case '7d':
      return period('7d', shiftKey(today, -6), today);
    case 'this_month':
      return period('this_month', `${today.slice(0, 8)}01`, today);
    case 'last_month': {
      const firstThisMonth = `${today.slice(0, 8)}01`;
      const lastPrevMonth = shiftKey(firstThisMonth, -1);
      return period('last_month', `${lastPrevMonth.slice(0, 8)}01`, lastPrevMonth);
    }
    case 'custom': {
      const { from, to } = input;
      if (from && to && DATE_KEY.test(from) && DATE_KEY.test(to) && from <= to) {
        const candidate = period('custom', from, to);
        if (candidate.days <= 366) return candidate;
      }
      return period('30d', shiftKey(today, -29), today);
    }
    default:
      return period('30d', shiftKey(today, -29), today);
  }
}

/** The equally long period just before this one, for trend comparisons. */
export function previousPeriod(current: ReportingPeriod): ReportingPeriod {
  return period(current.preset, shiftKey(current.fromKey, -current.days), shiftKey(current.fromKey, -1));
}

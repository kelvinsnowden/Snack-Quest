/**
 * Turns a current/previous-period pair from `businessAnalyticsService`
 * into a `TrendStatCard` trend prop — one place for the "no honest
 * comparison" guard so every dashboard applies it the same way. A
 * previous value of 0 has no real percent-change (division by zero,
 * or an arbitrary "+100%" that isn't a real rate), so it renders
 * nothing rather than a fabricated number.
 */
export function computePeriodTrend(
  current: number,
  previous: number,
  comparisonLabel: string,
): { percent: number; comparisonLabel: string } | undefined {
  if (previous <= 0) return undefined;
  return { percent: ((current - previous) / previous) * 100, comparisonLabel };
}

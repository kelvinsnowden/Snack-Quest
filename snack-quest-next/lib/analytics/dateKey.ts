/**
 * The `YYYY-MM-DD` key every traffic rollup is stored and bucketed by
 * (§ analytics rollups).
 *
 * UTC, matching what the admin charts already did when they bucketed
 * raw page views with `toISOString().slice(0, 10)`. Keeping the same
 * convention means the rollups agree with the numbers the charts used
 * to compute for themselves, rather than being off by a day for
 * anything recorded between midnight and 3am Nairobi time.
 */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The half-open `[start, end)` bounds of one `YYYY-MM-DD` day, UTC. */
export function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** The half-open `[start, end)` bounds of one `YYYY-MM` calendar month, UTC. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

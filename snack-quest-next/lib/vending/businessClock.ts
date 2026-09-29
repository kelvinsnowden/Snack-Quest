/**
 * The wall clock the business trades on. Machines sell in Nairobi, so
 * "the lunch rush" and "Saturday" mean Nairobi's hour and day — not the
 * hour of the server that happens to be reading the sale (Vercel runs
 * in UTC, three hours behind). Nairobi keeps no daylight saving, but the
 * zone is read through `Intl` rather than hard-coded as +3 so this stays
 * right if that ever changes.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Nairobi';

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
  weekday: 'short',
});

/** Hour (0–23) and weekday (`0` = Sunday … `6` = Saturday) of `at` on the business's clock. */
export function businessHourAndWeekday(at: Date): { hour: number; weekday: number } {
  let hour = 0;
  let weekday = 0;
  for (const part of formatter.formatToParts(at)) {
    if (part.type === 'hour') hour = Number(part.value) % 24;
    if (part.type === 'weekday') weekday = WEEKDAY_INDEX[part.value] ?? 0;
  }
  return { hour, weekday };
}

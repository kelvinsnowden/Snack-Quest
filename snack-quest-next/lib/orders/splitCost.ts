/**
 * Dividing one spend across the orders it covers
 * (§ fulfilment records the real cost).
 *
 * Its own module rather than living beside the route that uses it: a
 * Next.js Route Handler file may only export route handlers, and this
 * is arithmetic worth testing on its own regardless.
 *
 * The remainder is spread a shilling at a time over the first orders
 * rather than dropped, so the parts always add back to exactly what
 * was spent. Dropping it would quietly under-report the cost of the
 * business, by a little, forever.
 */
export function splitEvenly(totalKes: number, count: number): number[] {
  const base = Math.floor(totalKes / count);
  const remainder = totalKes - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

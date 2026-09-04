import { Gift } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';

/**
 * The PR boxes, said out loud
 * (§ separate PR boxes from revenue and averages).
 *
 * Every figure beside this — revenue, orders, average order value —
 * now excludes boxes that collected nothing, which is the only way
 * those numbers describe the business. But a giveaway that is merely
 * absent from the reporting is a cost nobody can see, and seven boxes
 * is a real amount of stock. So it is netted out of the averages and
 * stated here instead.
 *
 * Renders nothing when none were given away, rather than a zero: an
 * empty row on every screen for the rest of the shop's life is worse
 * than no row, and "we gave away nothing this month" is not news.
 *
 * Shared by Admin: Analytics and Finance: Revenue because both sit
 * directly under the same three cards from the same
 * `getRevenueOverview` call. One wording, so the two screens cannot
 * drift into describing the same seven boxes differently.
 */
export function ComplimentaryBoxesNote({
  orderCount,
  goodsAtListKes,
  days,
}: {
  orderCount: number;
  goodsAtListKes: number;
  days: number;
}) {
  if (orderCount < 1) {
    return null;
  }

  return (
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <Gift className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Excludes {orderCount === 1 ? '1 box' : `${orderCount} boxes`} sent free in the last {days}{' '}
        days — {formatKes(goodsAtListKes)} of stock at list price. PR and creator seeding collect no
        money, so they are kept out of revenue and out of the average.
      </span>
    </p>
  );
}

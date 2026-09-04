import { Star } from 'lucide-react';
import { Stars } from './ReviewCard';

/**
 * The rating histogram at the top of `/reviews` — the average, the
 * count, and how the published reviews break down by star. A server
 * component: every number it renders is already computed in
 * `ReviewService.listPublished` from the full published set, not from
 * whatever page of reviews happens to be shown below it, so there is
 * nothing here that needs to run on the client.
 */
export function RatingSummary({
  averageRating,
  totalCount,
  ratingCounts,
  variant = 'default',
}: {
  averageRating: number;
  totalCount: number;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  /**
   * `compact` keeps the score and the histogram side by side all the
   * way down to 320px, instead of stacking them below `sm`.
   *
   * The default stacks because on `/reviews` this is a full-width
   * banner with room to spare. In the homepage section it sits in a
   * column beside the featured review, and a stacked score there costs
   * a whole screen of height on a phone to say what fits on one line —
   * the histogram bars shrink perfectly well, and the number beside
   * them is what people actually read.
   */
  variant?: 'default' | 'compact';
}) {
  const largestBar = Math.max(1, ratingCounts[5], ratingCounts[4], ratingCounts[3], ratingCounts[2], ratingCounts[1]);
  const compact = variant === 'compact';

  return (
    <div
      className={
        compact
          ? 'border-border bg-surface flex flex-row items-center gap-4 rounded-2xl border p-4 sm:gap-6 sm:p-5'
          : 'border-border bg-surface flex flex-col gap-8 rounded-2xl border p-6 sm:flex-row sm:items-center sm:gap-10 md:p-8'
      }
    >
      <div
        className={
          compact
            ? 'flex shrink-0 flex-col items-start gap-1'
            : 'flex shrink-0 flex-col items-center gap-2 sm:items-start'
        }
      >
        <p
          className={`text-foreground font-bold tabular-nums tracking-tight ${compact ? 'text-4xl leading-none sm:text-5xl' : 'text-5xl'}`}
        >
          {averageRating.toFixed(1)}
        </p>
        <Stars rating={Math.round(averageRating)} className={compact ? 'size-4' : 'size-5'} />
        <p className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
          {compact
            ? `Based on ${totalCount} ${totalCount === 1 ? 'review' : 'reviews'}`
            : `${totalCount} ${totalCount === 1 ? 'review' : 'reviews'}`}
        </p>
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = ratingCounts[star];
          // Relative to the tallest bar, not to `totalCount` — a shop
          // where every review is 5 stars should show one full bar and
          // four empty ones, not five slivers.
          const widthPct = (count / largestBar) * 100;
          return (
            <div key={star} className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
              <span className="text-muted-foreground flex w-7 items-center justify-end gap-1 text-xs font-semibold tabular-nums">
                {star}
                <Star className="fill-muted-foreground text-muted-foreground size-3" aria-hidden="true" />
              </span>
              <div className={`bg-border/60 flex-1 overflow-hidden rounded-full ${compact ? 'h-1.5' : 'h-2'}`}>
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-muted-foreground w-4 text-right text-xs tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

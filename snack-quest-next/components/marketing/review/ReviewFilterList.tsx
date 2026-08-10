'use client';

import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewCard } from './ReviewCard';
import type { PublicReview } from '@/types';

type StarFilter = 1 | 2 | 3 | 4 | 5 | 'all';

/**
 * The star-filter pills on `/reviews`, plus the grid they filter.
 *
 * Filters `reviews` in the browser rather than re-querying the server,
 * because `reviews` is already the full page this component was given
 * — the same `ALL_REVIEWS_LIMIT`-bounded fetch the histogram above it
 * draws its own (separately, accurately computed) counts from. Pills
 * intentionally carry no counts of their own: labelling "4 stars (12)"
 * from a client-side slice of a possibly-larger published set would
 * either have to duplicate the histogram's real aggregate query or
 * show a number that quietly stops matching it once there are more
 * published reviews than this page fetches.
 */
export function ReviewFilterList({ reviews }: { reviews: PublicReview[] }) {
  const [filter, setFilter] = useState<StarFilter>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? reviews : reviews.filter((review) => review.rating === filter)),
    [reviews, filter],
  );

  return (
    <>
      <div role="group" aria-label="Filter reviews by rating" className="mt-8 flex flex-wrap gap-2">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </FilterPill>
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <FilterPill key={star} active={filter === star} onClick={() => setFilter(star)}>
            {star}
            <Star
              className={cn('size-3.5', filter === star ? 'fill-white' : 'fill-primary text-primary')}
              aria-hidden="true"
            />
          </FilterPill>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground mt-10 text-center text-sm">
          No {filter}-star reviews yet.{' '}
          <button type="button" onClick={() => setFilter('all')} className="text-primary font-medium hover:underline">
            Show all reviews
          </button>
        </p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((review) => (
            <li key={review.id}>
              <ReviewCard review={review} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-surface text-foreground hover:border-primary/50',
      )}
    >
      {children}
    </button>
  );
}

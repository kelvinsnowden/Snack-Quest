'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Reveal } from '../design/Reveal';
import { ReviewCard } from '../review/ReviewCard';
import type { PublicReview } from '@/types';

/**
 * The homepage review rail (§ homepage reviews) — a horizontally
 * swipeable, scroll-snapped row on a phone, a static 3-column grid
 * from `md` up.
 *
 * Two things live here specifically because they need real DOM
 * access, which is why this is a client component and `ReviewsSection`
 * itself isn't:
 *
 * - `touch-action: pan-x` on the rail. Without it, a touch that starts
 *   on the rail but isn't perfectly horizontal can get captured by
 *   this element's own scroll-snap instead of falling through to the
 *   page's vertical scroll — which reads as the page being stuck the
 *   moment someone tries to scroll past the cards rather than swipe
 *   through them. `pan-x` tells the browser this element only ever
 *   handles horizontal panning itself, so any vertical component of a
 *   gesture is left for the page to handle as a normal scroll.
 * - The prev/next buttons below `md`, an explicit way to move through
 *   the cards that never touches the page's scroll gesture at all —
 *   useful on its own, and a fallback for anyone the touch-action fix
 *   doesn't fully cover on a given device.
 */
export function ReviewRail({ reviews }: { reviews: PublicReview[] }) {
  const rail = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(reviews.length <= 1);

  function updateEdges() {
    const node = rail.current;
    if (!node) {
      return;
    }
    setAtStart(node.scrollLeft <= 4);
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 4);
  }

  function scrollByCard(direction: 1 | -1) {
    const node = rail.current;
    if (!node) {
      return;
    }
    const card = node.querySelector<HTMLElement>('[data-review-card]');
    // Falls back to a reasonable guess if the query ever comes up
    // empty — the `+16` matches the rail's own `gap-4`.
    const step = (card?.offsetWidth ?? node.clientWidth * 0.82) + 16;
    node.scrollBy({ left: step * direction, behavior: 'smooth' });
  }

  return (
    <div className="mt-9 md:mt-12">
      {reviews.length > 1 ? (
        <div className="mb-3 flex items-center justify-end gap-2 px-5 md:hidden">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label="Previous reviews"
            className="border-border bg-surface text-foreground flex size-9 items-center justify-center rounded-full border shadow-sm transition-opacity disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label="Next reviews"
            className="border-border bg-surface text-foreground flex size-9 items-center justify-center rounded-full border shadow-sm transition-opacity disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/*
        The rail: `snap-x` + per-card `snap-start` gives a native,
        momentum-preserving swipe with no JavaScript, so it works on
        the first paint and for a visitor whose JS never loads. The
        leading/trailing spacers keep the first and last cards aligned
        with the page's own padding while still letting the rail run
        edge to edge.
      */}
      <ul
        ref={rail}
        onScroll={updateEdges}
        style={{ touchAction: 'pan-x' }}
        className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:grid md:snap-none md:grid-cols-3 md:gap-6 md:overflow-visible md:px-10"
      >
        {/* Matches the section's own `px-5`, so the first card's
            left edge lines up with the heading above it rather
            than sitting a few pixels off. */}
        <li aria-hidden="true" className="w-5 shrink-0 md:hidden" />
        {reviews.map((review, index) => (
          <Reveal
            key={review.id}
            as="li"
            delayMs={Math.min(index, 3) * 90}
            className="w-[82vw] max-w-[340px] shrink-0 snap-start md:w-auto md:max-w-none"
          >
            <div data-review-card>
              <ReviewCard review={review} />
            </div>
          </Reveal>
        ))}
        {/* And the same again at the end, so the last card can
            scroll fully clear of the screen edge. */}
        <li aria-hidden="true" className="w-5 shrink-0 md:hidden" />
      </ul>
    </div>
  );
}

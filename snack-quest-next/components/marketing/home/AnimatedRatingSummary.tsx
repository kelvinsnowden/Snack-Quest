'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RatingSummary } from '../review/RatingSummary';

const DURATION_MS = 900;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function subscribeNever(): () => void {
  return () => {};
}

function canAnimate(): boolean {
  return (
    typeof IntersectionObserver !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function canAnimateOnServer(): boolean {
  return false;
}

/**
 * Homepage-only wrapper around `RatingSummary` (§ homepage reviews)
 * that counts the average up and grows each bar from zero the first
 * time it scrolls into view, instead of rendering already-final
 * numbers. `/reviews` keeps the plain, unanimated `RatingSummary`:
 * someone who navigated there deliberately doesn't need a
 * numbers-counting-up moment the way a section scrolled past on the
 * homepage does.
 *
 * Same hydration-safe pattern as `Reveal`: server render and the
 * client's hydration pass both report `animated = false` (matching
 * exactly, so no mismatch and the finished numbers show immediately
 * for a no-JS visitor or unsupported browser), then flip to the real
 * capability check right after hydration completes, at which point
 * the count-up takes over.
 */
export function AnimatedRatingSummary({
  averageRating,
  totalCount,
  ratingCounts,
  variant,
}: {
  averageRating: number;
  totalCount: number;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  /** Passed straight through — see `RatingSummary`. */
  variant?: 'default' | 'compact';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const animated = useSyncExternalStore(subscribeNever, canAnimate, canAnimateOnServer);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!animated || !node) {
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS);
          setProgress(easeOutCubic(t));
          if (t < 1) {
            frame = requestAnimationFrame(tick);
          }
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [animated]);

  // Not yet hydrated, or a browser/preference this animation skips:
  // show the real, finished numbers rather than a stuck zero.
  const shown = animated ? progress : 1;

  return (
    <div ref={ref}>
      <RatingSummary
        variant={variant}
        averageRating={averageRating * shown}
        totalCount={Math.round(totalCount * shown)}
        ratingCounts={{
          1: Math.round(ratingCounts[1] * shown),
          2: Math.round(ratingCounts[2] * shown),
          3: Math.round(ratingCounts[3] * shown),
          4: Math.round(ratingCounts[4] * shown),
          5: Math.round(ratingCounts[5] * shown),
        }}
      />
    </div>
  );
}

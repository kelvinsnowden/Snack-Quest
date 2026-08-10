import Link from 'next/link';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '../design/Reveal';
import { AnimatedRatingSummary } from './AnimatedRatingSummary';
import { ReviewRail } from './ReviewRail';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';
import type { PublicReview } from '@/types';

/**
 * Real customers, in their own words (§ homepage reviews).
 *
 * Mobile is the design target, not the fallback: the cards are a
 * scroll-snapped, swipeable rail on a phone (see ReviewRail.tsx) — the
 * interaction people already know from every feed they use — and only
 * become a grid once there's room for one. The rail bleeds past the
 * screen edge on purpose, so a half-visible next card makes it obvious
 * there's more to swipe.
 *
 * Photos lead the card when a review has them, because a real photo of
 * a real box is the most persuasive thing on this page, and they're
 * the reason the review form asks for them.
 *
 * Renders nothing when there are no published reviews. An empty
 * "no reviews yet" panel on a storefront is worse than no section at
 * all — it advertises the absence.
 */
export function ReviewsSection({
  reviews,
  totalCount,
  averageRating,
  ratingCounts,
}: {
  reviews: PublicReview[];
  totalCount: number;
  averageRating: number;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
}) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    // `scroll-mt` clears the sticky header, which would otherwise sit
    // on top of the heading when the nav's "Reviews" link jumps here.
    <section
      id="reviews"
      className="bg-background relative scroll-mt-20 overflow-hidden px-0 py-16 md:py-28"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-primary/10 absolute -top-20 right-0 size-[380px] rounded-full blur-3xl" />
        <div className="bg-home-lime/10 absolute -bottom-24 -left-16 size-[320px] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="px-5 md:px-10">
          <Reveal>
            <p className="text-caption text-primary font-bold tracking-[0.3em] uppercase">The verdict</p>
          </Reveal>

          <Reveal delayMs={100}>
            <h2 className="text-section-title text-foreground mt-4 max-w-2xl font-bold tracking-tight text-balance">
              What snackers are saying
            </h2>
          </Reveal>

          <Reveal delayMs={150}>
            <div className="mt-6">
              <AnimatedRatingSummary averageRating={averageRating} totalCount={totalCount} ratingCounts={ratingCounts} />
            </div>
          </Reveal>
        </div>

        <ReviewRail reviews={reviews} />

        <div className="mt-8 px-5 md:mt-12 md:px-10">
          <Reveal>
            <div className="border-border bg-surface flex flex-col items-center gap-4 rounded-2xl border p-6 text-center md:flex-row md:justify-between md:p-8 md:text-left">
              <div>
                <p className="text-foreground text-base font-semibold">Had a box of your own?</p>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  Takes a minute, and it genuinely helps the next person decide.
                </p>
              </div>
              <Button asChild size="lg" className={`${PRIMARY_CTA_CLASS} w-full shrink-0 md:w-auto`}>
                <Link href="/review">
                  <PenLine aria-hidden="true" />
                  Leave a review
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';
import { Reveal } from '../design/Reveal';
import { AnimatedRatingSummary } from './AnimatedRatingSummary';
import { CustomerPhotoStrip } from './CustomerPhotoStrip';
import { ReviewsSheet } from './ReviewsSheet';
import { ReviewQuoteCard } from '../review/ReviewQuoteCard';
import type { PublicReview } from '@/types';

/**
 * Real customers, in their own words (§ homepage reviews).
 *
 * ONE REVIEW, NOT A CAROUSEL. This section used to be a horizontally
 * scroll-snapped rail of full review cards. Two things were wrong with
 * that, and only the second is about taste:
 *
 * - The rail set `touch-action: pan-x` on itself, which does not let
 *   horizontal gestures through — it declares that the element handles
 *   horizontal panning and nothing else. A vertical swipe starting on
 *   a review card was therefore thrown away instead of scrolling the
 *   page, so a thumb resting on a review froze the site. No amount of
 *   resizing fixes that; the interaction had to be replaced.
 * - Nine cards at 82vw meant eight reviews permanently off-screen,
 *   reachable only by a gesture nothing on the page asked for. A
 *   storefront gets one glance, and it should spend it on the best
 *   evidence rather than on the first item of a queue.
 *
 * So: the score, the single strongest review, the photographs, and a
 * button. Everything else is one tap away in a sheet that scrolls
 * vertically like every other list on a phone.
 *
 * Renders nothing when there are no published reviews. An empty
 * "no reviews yet" panel on a storefront is worse than no section at
 * all — it advertises the absence.
 */

/**
 * Which review leads.
 *
 * Highest rated first, then the one carrying the most photographs,
 * then the newest. Photos are the tie-break rather than an
 * afterthought: among equally glowing reviews, the one with pictures
 * of the actual box is the one that persuades.
 *
 * Deliberately a pure, deterministic sort computed on the server —
 * anything random here would render one review on the server and a
 * different one on hydration.
 */
function pickFeatured(reviews: PublicReview[]): PublicReview {
  return [...reviews].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.photos.length - a.photos.length ||
      Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso),
  )[0];
}

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

  const featured = pickFeatured(reviews);

  return (
    // `scroll-mt` clears the sticky header, which would otherwise sit
    // on top of the heading when the nav's "Reviews" link jumps here.
    <section
      id="reviews"
      className="bg-background relative scroll-mt-20 overflow-hidden py-16 md:py-28"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-primary/10 absolute -top-20 right-0 size-[380px] rounded-full blur-3xl" />
        <div className="bg-secondary/10 absolute -bottom-24 -left-16 size-[320px] rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-5 md:gap-10 md:px-10">
        <div>
          <Reveal>
            <p className="text-caption text-primary font-bold tracking-[0.3em] uppercase">The verdict</p>
          </Reveal>

          <Reveal delayMs={100}>
            <h2 className="text-section-title text-foreground mt-3 max-w-xl font-bold tracking-tight text-balance">
              What snackers are saying
            </h2>
          </Reveal>

          <Reveal delayMs={140}>
            <p className="text-muted-foreground mt-3 max-w-md text-base text-pretty">
              Real reactions from people who&rsquo;ve opened a Snack Quest box.
            </p>
          </Reveal>
        </div>

        {/*
          Two columns from `md`, exactly as the reference has it: the
          score beside the review rather than stacked above it. Below
          that they fall into one column in the order a phone reads
          them — verdict first, then the voice behind it.

          `items-start` so the shorter column does not stretch to match
          the taller one, which would leave the summary card floating
          in dead space next to a long quote.
        */}
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-6">
          <Reveal delayMs={160}>
            <AnimatedRatingSummary
              averageRating={averageRating}
              totalCount={totalCount}
              ratingCounts={ratingCounts}
              variant="compact"
            />
          </Reveal>

          <Reveal delayMs={200}>
            {/*
              Labelled on mobile only. In the two-column layout the
              card's position beside the score already says what it is,
              and a heading there would be a label on a thing that
              needs none.
            */}
            <p className="text-foreground mb-2 text-base font-bold md:hidden">Featured review</p>
            <ReviewQuoteCard review={featured} emphasis />
          </Reveal>
        </div>

        <Reveal delayMs={240}>
          <CustomerPhotoStrip reviews={reviews} />
        </Reveal>

        <Reveal delayMs={280}>
          <div className="flex flex-col items-center gap-3">
            <ReviewsSheet reviews={reviews} totalCount={totalCount} />
            {/*
              Kept, quietly. The reference has no "leave a review" on
              this screen — it lives in the sheet — but a visitor who
              never opens the sheet would then have no way to write one
              from the homepage at all, and asking is how these reviews
              got here. Secondary on purpose: reading them is what this
              section is for.
            */}
            <Link
              href="/review"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              Had a box of your own? Write a review
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

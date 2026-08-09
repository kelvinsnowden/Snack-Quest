import Image from 'next/image';
import Link from 'next/link';
import { PenLine, Quote, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '../design/Reveal';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';
import type { PublicReview } from '@/types';

/**
 * Real customers, in their own words (§ homepage reviews).
 *
 * Mobile is the design target, not the fallback: the cards are a
 * scroll-snapped, swipeable rail on a phone — the interaction people
 * already know from every feed they use — and only become a grid once
 * there's room for one. The rail bleeds past the screen edge on
 * purpose, so a half-visible next card makes it obvious there's more
 * to swipe without needing arrows or dots.
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
}: {
  reviews: PublicReview[];
  totalCount: number;
  averageRating: number;
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
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Stars rating={Math.round(averageRating)} className="size-5" />
              <p className="text-foreground text-base font-semibold tabular-nums">
                {averageRating.toFixed(1)}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  from {totalCount} {totalCount === 1 ? 'review' : 'reviews'}
                </span>
              </p>
            </div>
          </Reveal>
        </div>

        {/*
          The rail: `snap-x` + per-card `snap-start` gives a native,
          momentum-preserving swipe with no JavaScript, so it works on
          the first paint and for a visitor whose JS never loads. The
          leading/trailing spacers keep the first and last cards aligned
          with the page's own padding while still letting the rail run
          edge to edge.
        */}
        <div className="mt-9 md:mt-12">
          <ul className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:grid md:snap-none md:grid-cols-3 md:gap-6 md:overflow-visible md:px-10">
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
                <ReviewCard review={review} />
              </Reveal>
            ))}
            {/* And the same again at the end, so the last card can
                scroll fully clear of the screen edge. */}
            <li aria-hidden="true" className="w-5 shrink-0 md:hidden" />
          </ul>
        </div>

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

export function ReviewCard({ review }: { review: PublicReview }) {
  const [lead, ...rest] = review.photos;

  return (
    <figure className="border-border bg-surface flex h-full flex-col overflow-hidden rounded-2xl border shadow-[0_20px_50px_-30px_rgb(31_31_31/0.35)]">
      {lead ? (
        <div className="bg-border/40 relative aspect-[4/3] w-full">
          <Image
            src={lead.url}
            alt={`Photo from ${review.customerName}'s Snack Quest box`}
            fill
            sizes="(min-width: 768px) 33vw, 82vw"
            className="object-cover"
          />
          {rest.length > 0 ? (
            <div className="absolute right-2.5 bottom-2.5 flex gap-1.5">
              {rest.map((photo) => (
                <div
                  key={photo.url}
                  className="relative size-11 overflow-hidden rounded-lg border-2 border-white/80 shadow-sm"
                >
                  <Image src={photo.url} alt="" fill sizes="44px" className="object-cover" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <Stars rating={review.rating} className="size-4" />
          <Quote className="text-primary/25 size-6 shrink-0" aria-hidden="true" />
        </div>

        <blockquote className="text-foreground flex-1 text-base leading-relaxed text-pretty">
          {review.body}
        </blockquote>

        <figcaption className="border-border flex items-center gap-3 border-t pt-4">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          >
            {review.customerName.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">{review.customerName}</p>
            <p className="text-muted-foreground text-sm">Verified by Snack Quest</p>
          </div>
        </figcaption>
      </div>
    </figure>
  );
}

/**
 * Five stars with `rating` filled. The accessible name carries the
 * number, and the stars themselves are hidden from assistive tech —
 * otherwise a screen reader reads "star star star star star" and
 * conveys nothing about the score.
 */
export function Stars({ rating, className }: { rating: number; className: string }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${className} ${star <= rating ? 'fill-primary text-primary' : 'fill-transparent text-border'}`}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

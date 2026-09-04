'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ReviewLightbox } from '../review/ReviewLightbox';
import type { PublicReview } from '@/types';

const STRIP_LIMIT = 10;

/**
 * Real boxes, opened by real people (§ homepage reviews).
 *
 * Every photo customers attached to their reviews, flattened into one
 * strip and pooled across reviews — the point of this row is the
 * weight of evidence, and splitting it back up by author would waste
 * that on a phone.
 *
 * Deliberately still a horizontal scroller, unlike the review cards it
 * sits under, and that is not a contradiction. The rail had to go
 * because tall cards hid whole reviews off-screen behind a gesture and
 * blocked the page's own scrolling; a 96px photo row shows a dozen
 * thumbnails at once, hides nothing that isn't obviously more of the
 * same, and — critically — sets no `touch-action`, so the browser
 * keeps its default behaviour and a vertical swipe scrolls the page as
 * it should.
 *
 * Each thumb opens the lightbox at that exact photo, on that photo's
 * own review, so the words that came with the picture travel with it.
 */
export function CustomerPhotoStrip({ reviews }: { reviews: PublicReview[] }) {
  const [openAt, setOpenAt] = useState<{ review: PublicReview; index: number } | null>(null);

  const photos = reviews.flatMap((review) =>
    review.photos.map((photo, index) => ({ url: photo.url, review, index })),
  );

  if (photos.length === 0) {
    return null;
  }

  const strip = photos.slice(0, STRIP_LIMIT);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-foreground text-base font-bold">Customer photos</h3>
        <Link
          href="/reviews"
          className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
        >
          See all photos
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {/*
        `-mx-5 px-5` lets the strip run to the screen edge while its
        first thumb still lines up with the heading above it, so a
        half-visible photo at the edge reads as "more this way" rather
        than as a clipped layout. The negative margin is undone by the
        matching padding, so nothing here can widen the page.
      */}
      <ul className="scrollbar-none -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
        {strip.map((photo) => (
          <li key={`${photo.review.id}-${photo.index}`}>
            <button
              type="button"
              onClick={() => setOpenAt({ review: photo.review, index: photo.index })}
              aria-label={`View this photo from ${photo.review.customerName}'s review`}
              className="focus-visible:ring-primary bg-border/40 relative block size-20 shrink-0 cursor-zoom-in overflow-hidden rounded-xl outline-none focus-visible:ring-2 sm:size-24"
            >
              <Image src={photo.url} alt="" fill sizes="(min-width: 640px) 96px, 80px" className="object-cover" />
            </button>
          </li>
        ))}
      </ul>

      {openAt ? (
        <ReviewLightbox
          review={openAt.review}
          initialIndex={openAt.index}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </>
  );
}

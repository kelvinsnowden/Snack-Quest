'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BadgeCheck } from 'lucide-react';
import { Stars } from './ReviewCard';
import { ReviewerAvatar } from './ReviewerAvatar';
import { ReviewLightbox } from './ReviewLightbox';
import type { PublicReview } from '@/types';

/**
 * One review as a quote card — stars, the words, who said them, and a
 * row of small photo thumbs.
 *
 * Distinct from `ReviewCard`, which leads with a 16:10 hero photo and
 * was built to sit in a three-across grid. That shape is why the phone
 * layout needed a carousel in the first place: a card that tall can
 * only fit on screen one at a time. Here the photos are thumbnails at
 * the foot, so several of these stack vertically in a scrolling sheet
 * — which is the interaction this replaced the carousel with.
 *
 * `ReviewCard` still serves `/reviews`, where the grid has the room
 * its proportions were designed for.
 *
 * The photos stay tappable: a review's photos are the most persuasive
 * thing on the page, and a thumbnail that cannot be opened advertises
 * something it then refuses to show. The lightbox mounts only once
 * opened, so a sheet holding eleven of these ships eleven buttons
 * rather than eleven hidden viewers.
 */
export function ReviewQuoteCard({
  review,
  emphasis = false,
}: {
  review: PublicReview;
  /** The featured slot: a touch more padding and a lifted surface. */
  emphasis?: boolean;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const photos = review.photos;
  // Three thumbs plus a "+N" tile is what fits across 320px without
  // any of them dropping below a comfortable tap target.
  const shown = photos.slice(0, 3);
  const overflow = photos.length - shown.length;

  return (
    <>
      <figure
        className={`border-border bg-surface flex flex-col rounded-2xl border ${
          emphasis
            ? 'p-4 shadow-[0_20px_50px_-30px_rgb(31_31_31/0.35)] sm:p-5'
            : 'p-4'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <Stars rating={review.rating} className="size-4" />
          {review.isVerifiedPurchase ? (
            /*
              Purple rather than green. On this site orange is "buy" and
              green is a success state; the badge is neither, it is a
              fact about provenance — and purple is the brand's second
              colour, so it belongs to the page without borrowing a
              meaning it should not have.
            */
            <span className="text-secondary bg-secondary/10 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Verified purchase
            </span>
          ) : null}
        </div>

        <blockquote className="text-foreground mt-3 text-base leading-relaxed text-pretty">
          &ldquo;{review.body}&rdquo;
        </blockquote>

        <figcaption className="mt-4 flex items-center gap-2.5">
          <ReviewerAvatar name={review.customerName} />
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">{review.customerName}</p>
            <time dateTime={review.createdAtIso} className="text-muted-foreground text-xs">
              {new Date(review.createdAtIso).toLocaleDateString('en-KE', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </time>
          </div>
        </figcaption>

        {photos.length > 0 ? (
          <div className="mt-3 flex gap-2">
            {shown.map((photo, index) => (
              <button
                key={photo.url}
                type="button"
                onClick={() => setOpenAt(index)}
                aria-label={`View photo ${index + 1} from ${review.customerName}'s review`}
                className="focus-visible:ring-primary bg-border/40 relative size-16 shrink-0 cursor-zoom-in overflow-hidden rounded-xl outline-none focus-visible:ring-2"
              >
                <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
            {overflow > 0 ? (
              <button
                type="button"
                onClick={() => setOpenAt(shown.length)}
                aria-label={`View the other ${overflow} photos from ${review.customerName}'s review`}
                className="border-border bg-background text-muted-foreground focus-visible:ring-primary flex size-16 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-semibold outline-none focus-visible:ring-2"
              >
                <span className="text-foreground text-sm">+{overflow}</span>
                photos
              </button>
            ) : null}
          </div>
        ) : null}
      </figure>

      {openAt !== null ? (
        <ReviewLightbox review={review} initialIndex={openAt} onClose={() => setOpenAt(null)} />
      ) : null}
    </>
  );
}

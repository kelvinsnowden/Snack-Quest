'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Images, Quote, Star } from 'lucide-react';
import { ReviewLightbox } from './ReviewLightbox';
import type { PublicReview } from '@/types';

/**
 * One published review (§ homepage reviews, review gallery).
 *
 * A client component because the photos open. That is the whole point
 * of the change: the card used to crop one photo and shrink the rest
 * into 44px squares that could not be opened, which is the worst of
 * both — it advertised that there was more to see and then refused to
 * show it. Now the media is a button, and every photo is reachable.
 *
 * The lightbox is only mounted once opened, so a page carrying twelve
 * reviews ships twelve buttons rather than twelve hidden viewers.
 *
 * The card itself stays a standard, uniform size regardless of how
 * much someone wrote — the body is clamped to four lines with its own
 * inline "Read more" toggle, rather than the card growing to fit
 * whatever length review landed on it. That toggle is a plain expand
 * in place: only tapping the *photo* opens the full-screen viewer, so
 * reading a long review never triggers the same takeover as looking
 * at a photo does.
 */
export function ReviewCard({ review }: { review: PublicReview }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lead, ...rest] = review.photos;
  const hasPhotos = review.photos.length > 0;
  // No server-side way to know if four clamped lines will actually
  // truncate this body, so this is a stand-in: short enough bodies
  // never need the toggle, and the rare long-but-not-quite-truncated
  // one gets a harmless "Read more" that expands onto an identical
  // line — better than a truncated review with no way to read the rest.
  const isLong = review.body.length > 180;

  return (
    <>
      <figure className="border-border bg-surface group flex h-full flex-col overflow-hidden rounded-2xl border shadow-[0_20px_50px_-30px_rgb(31_31_31/0.35)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-30px_rgb(31_31_31/0.45)]">
        {review.videoUrl ? (
          <video
            src={review.videoUrl}
            controls
            playsInline
            preload="none"
            className="aspect-[16/10] w-full bg-black object-cover"
            aria-label={`Video from ${review.customerName}'s Snack Quest box`}
          />
        ) : hasPhotos ? (
          <button
            type="button"
            onClick={() => setOpenAt(0)}
            aria-label={`View ${review.photos.length} ${review.photos.length === 1 ? 'photo' : 'photos'} from ${review.customerName}'s review`}
            className="focus-visible:ring-primary relative block aspect-[16/10] w-full cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            <Image
              src={lead.url}
              alt=""
              fill
              sizes="(min-width: 768px) 33vw, 82vw"
              className="bg-border/40 object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />

            {/* A wash at the foot of the image so the badge stays
                readable over a bright photo without dimming the whole
                picture. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent"
            />

            {review.photos.length > 1 ? (
              <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-foreground shadow-sm">
                <Images className="size-3.5" aria-hidden="true" />
                {review.photos.length}
              </span>
            ) : null}

            {rest.length > 0 ? (
              <span className="absolute bottom-3 left-3 flex gap-1.5">
                {rest.slice(0, 2).map((photo) => (
                  <span
                    key={photo.url}
                    className="relative size-10 overflow-hidden rounded-lg border-2 border-white/85 shadow-sm"
                  >
                    <Image src={photo.url} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <Stars rating={review.rating} className="size-4" />
            <Quote className="text-primary/25 size-6 shrink-0" aria-hidden="true" />
          </div>

          <div className="flex-1">
            <blockquote
              className={`text-foreground text-base leading-relaxed text-pretty ${expanded ? '' : 'line-clamp-4'}`}
            >
              {review.body}
            </blockquote>
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-primary mt-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            ) : null}
          </div>

          <figcaption className="border-border/70 flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-foreground text-sm font-semibold">{review.customerName}</p>
            {hasPhotos && !review.videoUrl ? (
              <button
                type="button"
                onClick={() => setOpenAt(0)}
                className="text-primary text-sm font-medium underline-offset-4 hover:underline"
              >
                See photos
              </button>
            ) : (
              <time
                dateTime={review.createdAtIso}
                className="text-muted-foreground text-xs"
              >
                {new Date(review.createdAtIso).toLocaleDateString('en-KE', {
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            )}
          </figcaption>
        </div>
      </figure>

      {openAt !== null ? (
        <ReviewLightbox review={review} initialIndex={openAt} onClose={() => setOpenAt(null)} />
      ) : null}
    </>
  );
}

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

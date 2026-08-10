'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Star, X } from 'lucide-react';
import type { PublicReview } from '@/types';

/**
 * The full-screen review viewer (§ review gallery).
 *
 * Review photos are the most persuasive thing on the storefront — a
 * real box, opened by a real person — and until now they were
 * decoration: a cropped lead image with two thumbnails too small to
 * read and no way to open either. Someone weighing up a KES 2,000
 * purchase wants to *look*, and the page wouldn't let them.
 *
 * Built for a thumb first. Swipe between photos, tap anywhere dark to
 * leave, and the review's own words travel with the images instead of
 * being left behind on the card — the photo is what draws the eye, but
 * the sentence underneath it is what actually converts.
 *
 * Native scroll-snap does the paging rather than a drag library: it
 * inherits the platform's own momentum and rubber-banding, which is
 * what makes it feel like the photo viewers people already use, and it
 * costs no dependency.
 */
export function ReviewLightbox({
  review,
  initialIndex,
  onClose,
}: {
  review: PublicReview;
  initialIndex: number;
  onClose: () => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const photos = review.photos;

  function scrollTo(next: number) {
    const node = rail.current;
    if (node) {
      node.scrollTo({ left: node.clientWidth * next, behavior: 'smooth' });
    }
  }

  // Escape to leave, arrows to page — a viewer that traps a keyboard
  // user is worse than no viewer.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key === 'ArrowRight') {
        scrollTo(Math.min(index + 1, photos.length - 1));
      }
      if (event.key === 'ArrowLeft') {
        scrollTo(Math.max(index - 1, 0));
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  // The page behind must not scroll while this is open, or closing
  // drops you somewhere you never navigated to.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Open on the photo that was tapped, not always the first.
  useEffect(() => {
    const node = rail.current;
    if (node) {
      node.scrollTo({ left: node.clientWidth * initialIndex, behavior: 'instant' });
    }
  }, [initialIndex]);

  function onScroll() {
    const node = rail.current;
    if (node) {
      setIndex(Math.round(node.scrollLeft / node.clientWidth));
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photos from ${review.customerName}'s review`}
      className="animate-fade-in fixed inset-0 z-[70] flex flex-col bg-black/95 backdrop-blur-sm"
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3"
      >
        <span className="text-sm font-medium text-white/70 tabular-nums">
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : null}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 basis-1/2">
        <div
          ref={rail}
          onScroll={onScroll}
          className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto"
        >
          {photos.map((photo) => (
            <div
              key={photo.url}
              className="relative h-full w-full shrink-0 snap-center"
            >
              <Image
                src={photo.url}
                alt={`Photo from ${review.customerName}'s Snack Quest box`}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          ))}
        </div>

        {/* Pointer-only: a phone swipes, and arrows over the image
            would just cover it. */}
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => scrollTo(Math.max(index - 1, 0))}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute top-1/2 left-4 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 disabled:opacity-0 md:flex"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollTo(Math.min(index + 1, photos.length - 1))}
              disabled={index === photos.length - 1}
              aria-label="Next photo"
              className="absolute top-1/2 right-4 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 disabled:opacity-0 md:flex"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {/*
        The words come with the pictures. Someone who opened a photo to
        judge whether the box is worth it should not have to close it
        again to read what the person said.

        This panel scrolls, and that is a fix rather than a nicety: it
        was `shrink-0` with the body clamped to four lines, so a long
        review simply ran out of card — no scroll, no expand, no way to
        read the rest. `overscroll-contain` stops that scroll chaining
        into the page behind once it bottoms out, and the height cap
        keeps the photo the larger half of the screen.
      */}
      <div className="max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5" role="img" aria-label={`${review.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`size-3.5 ${star <= review.rating ? 'fill-home-lime text-home-lime' : 'fill-transparent text-white/25'}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ))}
            </span>
            <p className="text-sm font-semibold text-white">{review.customerName}</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/75">{review.body}</p>

          {photos.length > 1 ? (
            <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto">
              {photos.map((photo, i) => (
                <button
                  key={photo.url}
                  type="button"
                  onClick={() => scrollTo(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-current={i === index}
                  className={`relative size-12 shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${
                    i === index ? 'ring-home-lime scale-100 ring-2' : 'scale-95 opacity-50'
                  }`}
                >
                  <Image src={photo.url} alt="" fill sizes="48px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquareQuote, PenLine, X } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ReviewQuoteCard } from '../review/ReviewQuoteCard';
import { PRIMARY_CTA_CLASS } from '../design/ctaStyles';
import type { PublicReview } from '@/types';

/**
 * "See all reviews", and the sheet it opens
 * (§ homepage reviews — replacing the swipe rail).
 *
 * WHAT THIS REPLACED, AND WHY. The reviews used to be a horizontally
 * scroll-snapped rail. Its own container set `touch-action: pan-x`,
 * which does not mean "let horizontal gestures through" — it means
 * this element handles horizontal panning and nothing else, so a
 * vertical swipe beginning on a review card was discarded rather than
 * passed up to the page. On a phone, resting a thumb on a review and
 * trying to scroll did nothing at all. That is a property of the
 * architecture, not of the card sizes, so resizing could not have
 * fixed it: the rail had to go.
 *
 * A bottom sheet is the replacement because the reviews are a detour,
 * not a destination. Someone reading the homepage wants the verdict in
 * one glance and the detail on demand — and a sheet returns them
 * exactly where they were, which a trip to `/reviews` does not.
 *
 * Built on the shared Radix-backed `Sheet` rather than a hand-rolled
 * overlay, which is what makes the hard guarantee cheap: Escape
 * closes it, the backdrop closes it, focus is trapped while it is open
 * and restored to the trigger afterwards, and body scroll is locked
 * and released by the primitive rather than by an effect of ours that
 * could leave the page frozen if it ever unmounted the wrong way.
 *
 * The z-index is raised above the fixed "Order on chat / Buy now" bar,
 * which sits at z-50. Both panel and backdrop move together — lifting
 * only the panel would leave the dimmed layer painting behind the very
 * bar it is supposed to cover, so the buy button would stay lit and
 * tappable under a modal.
 */
export function ReviewsSheet({
  reviews,
  totalCount,
}: {
  reviews: PublicReview[];
  /** Every published review, which can exceed what the homepage loaded. */
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);
  const hasAll = reviews.length >= totalCount;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`${PRIMARY_CTA_CLASS} text-primary-foreground flex h-12 w-full items-center justify-center gap-2 px-6 text-base font-semibold sm:w-auto`}
        >
          <MessageSquareQuote className="size-5" aria-hidden="true" />
          {hasAll ? `See all ${totalCount} reviews` : `See ${reviews.length} reviews`}
        </button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        hideClose
        className="z-[60] mx-auto max-w-2xl"
        overlayClassName="z-[60]"
      >
        {/*
          Sticky, so the way out never scrolls off the top of a long
          list — the single most important control in the sheet should
          not require scrolling back to reach.
        */}
        <div className="border-border bg-surface sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-3xl border-b px-5 py-4">
          <SheetTitle className="text-foreground text-lg font-bold tracking-tight">
            {hasAll ? `All reviews (${totalCount})` : `Reviews (${reviews.length} of ${totalCount})`}
          </SheetTitle>
          <SheetDescription>
            Every published Snack Quest review, newest first.
          </SheetDescription>
          <SheetClose
            aria-label="Close reviews"
            className="text-muted-foreground hover:bg-border/40 hover:text-foreground focus-visible:ring-primary flex size-9 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2"
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        </div>

        {/*
          The one scrolling region. `overscroll-contain` stops a flick
          at the bottom of the list from chaining into the page behind,
          which is how a sheet ends up scrolling the thing it is
          covering.
        */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="flex flex-col gap-3">
            {reviews.map((review) => (
              <ReviewQuoteCard key={review.id} review={review} />
            ))}
          </div>

          {!hasAll ? (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              <Link href="/reviews" className="text-primary font-medium underline underline-offset-4">
                See all {totalCount} reviews
              </Link>
            </p>
          ) : null}
        </div>

        {/*
          Padded for the home indicator. The sheet covers the sticky buy
          bar, so this is the bottom of the screen for as long as it is
          open.
        */}
        <div
          className="border-border bg-surface shrink-0 border-t px-5 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Link
            href="/review"
            className={`${PRIMARY_CTA_CLASS} text-primary-foreground flex h-12 w-full items-center justify-center gap-2 text-base font-semibold`}
          >
            <PenLine className="size-5" aria-hidden="true" />
            Write a review
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

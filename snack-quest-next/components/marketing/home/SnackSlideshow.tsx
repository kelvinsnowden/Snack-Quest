'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInfiniteSnap } from './useInfiniteSnap';
import { SnackImmersiveViewer } from './SnackImmersiveViewer';

export interface SlideshowSnack {
  id: string;
  name: string;
  origin: string | null;
  imageUrl: string;
}

/** How long each snack holds before the next one slides in. */
const ADVANCE_MS = 3200;

/**
 * How long after a touch before the strip starts drifting again.
 *
 * It used to never start again: one touch and autoplay was off for
 * good, on the reasoning that something moving under a reader's finger
 * is what carousels are disliked for. True while they are looking —
 * and wrong the moment they stop, because a strip that has gone
 * permanently still says the same thing an empty shelf does. Long
 * enough that it never moves under an active finger; short enough that
 * attention drifting back finds it alive.
 */
const RESUME_AFTER_MS = 5000;

/**
 * The snacks, as a strip you can fall into (§ What's inside —
 * slideshow).
 *
 * Three things do the work, and none of them is the photographs:
 *
 * **It has no end.** `useInfiniteSnap` repeats the list and quietly
 * re-centres, so swiping never lands on a dead slide and never rewinds
 * the whole strip. Reaching the end of something is a decision point,
 * and a decision point is where drifting stops.
 *
 * **Neighbours show.** Slides are narrower than the frame, so the next
 * snack is always half-visible at the edge. A single centred photo
 * looks finished; a photo with something arriving behind it asks to be
 * pushed. That sliver is the whole invitation to swipe.
 *
 * **It says how far, not how many.** A row of dots is a count, and a
 * count is a length to finish — twenty dots reads as a chore before a
 * single one is looked at. A line that fills says only that there is
 * more, at any catalogue size.
 *
 * Tapping any snack opens `SnackImmersiveViewer`, which is where the
 * actual drifting is meant to happen: this strip's job is to be
 * interesting enough to tap.
 */
export function SnackSlideshow({
  snacks,
  ctaHref = '#boxes',
  fromPriceKes = null,
}: {
  snacks: SlideshowSnack[];
  ctaHref?: string;
  fromPriceKes?: number | null;
}) {
  const { trackRef, index, loops, step, start } = useInfiniteSnap({
    count: snacks.length,
    axis: 'x',
  });
  const [paused, setPaused] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  const resumeTimer = useRef<number | undefined>(undefined);
  const returnFocusTo = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    start(0);
  }, [start]);

  /** Hands the strip over to whoever touched it, and takes it back once they have stopped. */
  const handOver = useCallback(() => {
    setPaused(true);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPaused(false), RESUME_AFTER_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  useEffect(() => {
    if (paused || snacks.length < 2 || opened !== null) return;
    // Never for someone who asked for less motion — for them the strip
    // is theirs to move and nothing else touches it.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => step(1), ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused, snacks.length, opened, step]);

  function open(sourceIndex: number, trigger: HTMLButtonElement | null) {
    returnFocusTo.current = trigger;
    setOpened(sourceIndex);
  }

  function close() {
    setOpened(null);
    // Back to the snack they opened, not the top of the page.
    returnFocusTo.current?.focus();
  }

  const slides = Array.from({ length: snacks.length * loops }, (_, i) => ({
    snack: snacks[i % snacks.length],
    source: i % snacks.length,
    key: i,
    // Only the one actually on screen at first paint is worth blocking
    // render on; every other copy is off to the side.
    eager: i === Math.floor(loops / 2) * snacks.length,
  }));

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        // `onPointerDown` rather than `onScroll`: autoplay's own smooth
        // scroll fires scroll events too, and pausing on those would
        // mean it stopped itself after a single slide.
        onPointerDown={handOver}
        onKeyDown={handOver}
        tabIndex={0}
        aria-label="Snacks that go into a Snack Quest box"
        className={cn(
          'scrollbar-none focus-visible:ring-secondary flex w-full snap-x snap-mandatory overflow-x-auto focus-visible:ring-2 focus-visible:outline-none',
          /*
            The padding *is* the peek, and the slide is simply what is
            left. Percentage widths on a flex child resolve against the
            content box, which this padding has already narrowed — so
            asking for "78% wide inside 11% padding" quietly compounded
            the two and produced a slide barely half the screen. Making
            the slide `w-full` sidesteps the compounding entirely: it
            fills the content box exactly, which puts it dead centre
            with 11.5% of the track showing either side, and the
            neighbour occupying all of that but the gap.

            Percentages rather than `vw` on purpose: the track is
            full-bleed today, but it is one layout change away from not
            being, and `vw` measures a screen this element may not own.
          */
          'gap-3 px-[11.5%] md:px-[calc(50%-210px)]',
        )}
        style={{ scrollbarWidth: 'none' }}
      >
        {slides.map(({ snack, source, key, eager }) => (
          <li key={key} className="w-full flex-none snap-center md:w-[420px]">
            <button
              type="button"
              onClick={(event) => open(source, event.currentTarget)}
              // The name lives here rather than on screen: a
              // screen-reader user has no packet in a photo to read it
              // off, and "Japan" four times over would be four
              // indistinguishable buttons.
              aria-label={`View ${snack.name} full screen`}
              className={cn(
                'group focus-visible:ring-secondary relative block aspect-[4/5] w-full overflow-hidden rounded-[40px] transition-opacity duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none',
                /*
                  Neighbours sit back. Three photographs at equal
                  weight is a row of things to compare, which is work;
                  one lit and the rest receding is a single thing to
                  look at, with more of it waiting. Opacity rather than
                  scale on purpose — scaling a snap child moves the
                  point the track snaps to and makes the strip fight
                  the finger.
                */
                source === index ? 'opacity-100' : 'opacity-45',
              )}
            >
              <Image
                src={snack.imageUrl}
                alt=""
                fill
                sizes="(min-width: 768px) 420px, 82vw"
                className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                priority={eager}
              />

              <span
                aria-hidden="true"
                className="text-immersive-foreground absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-black/35 opacity-0 backdrop-blur transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <Expand className="size-4" />
              </span>

              {/*
                Origin only. The snack's own name is on the packet in
                the photo, so printing it again says nothing the
                picture does not — where it travelled from is the part
                a picture cannot tell you.
              */}
              {snack.origin ? (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-5 pt-16">
                  <span className="text-immersive-foreground block text-base font-semibold">
                    {snack.origin}
                  </span>
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {snacks.length > 1 ? (
        <>
          <SlideButton side="left" onClick={() => { handOver(); step(-1); }} />
          <SlideButton side="right" onClick={() => { handOver(); step(1); }} />

          {/*
            Distance travelled, not items remaining — see this
            component's own comment on why a row of dots works against
            the thing this section is for.
          */}
          <div className="mx-auto mt-6 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-foreground/10">
            <div
              className="bg-secondary h-full rounded-full transition-[width] duration-250 ease-out"
              style={{ width: `${((index + 1) / snacks.length) * 100}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-3 text-center text-caption">
            Tap a snack to see it full screen
          </p>
        </>
      ) : null}

      {opened !== null ? (
        <SnackImmersiveViewer
          snacks={snacks}
          startIndex={opened}
          onClose={close}
          ctaHref={ctaHref}
          fromPriceKes={fromPriceKes}
        />
      ) : null}
    </div>
  );
}

function SlideButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous snack' : 'Next snack'}
      className={cn(
        // Hidden on touch: a swipe is the gesture there, and two
        // buttons sitting over the photo would only cover it.
        'text-foreground absolute top-[40%] z-20 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition duration-150 ease-out hover:bg-white md:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

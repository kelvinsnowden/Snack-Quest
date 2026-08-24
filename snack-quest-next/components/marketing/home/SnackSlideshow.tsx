'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlideshowSnack {
  id: string;
  name: string;
  origin: string | null;
  imageUrl: string;
}

/** How long each snack holds before the next one slides in. */
const ADVANCE_MS = 3200;

/**
 * The snacks themselves, as a slideshow (§ What's inside — slideshow).
 *
 * Built on native scroll-snap rather than a JS-transformed track, and
 * that is the whole design decision: 98.6% of this site's traffic is
 * mobile, so swiping has to feel like the phone's own scrolling —
 * momentum, rubber-banding, interruptibility — none of which a
 * hand-rolled drag handler reproduces convincingly. Autoplay is then
 * just a scheduled `scrollTo` on the same track, so the automatic and
 * manual paths move the carousel exactly one way.
 *
 * Autoplay stops the moment a person touches it, and never starts for
 * someone who asked for reduced motion. Something advancing on its own
 * under a reader's finger is the failure mode carousels are disliked
 * for.
 */
export function SnackSlideshow({ snacks }: { snacks: SlideshowSnack[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  // Set once a person scrolls, swipes or presses a control. Autoplay
  // never resumes after that — resuming would fight whoever is looking.
  const [taken, setTaken] = useState(false);

  const scrollTo = useCallback((next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[next] as HTMLElement | undefined;
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }, []);

  // Which slide is actually showing, read from the scroll position
  // rather than tracked separately — a swipe moves the track without
  // going through any of this component's own handlers.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = trackRef.current;
        if (!el) return;
        const width = el.clientWidth || 1;
        setIndex(Math.round(el.scrollLeft / width));
      });
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (taken || snacks.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const width = track.clientWidth || 1;
      const next = (Math.round(track.scrollLeft / width) + 1) % snacks.length;
      scrollTo(next);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [taken, snacks.length, scrollTo]);

  function step(delta: number) {
    setTaken(true);
    scrollTo((index + delta + snacks.length) % snacks.length);
  }

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        // `onPointerDown` rather than `onScroll`: autoplay's own
        // smooth scroll fires scroll events too, and stopping on those
        // would mean it halted after a single slide.
        onPointerDown={() => setTaken(true)}
        onKeyDown={() => setTaken(true)}
        tabIndex={0}
        aria-label="Snacks that go into a Snack Quest box"
        className="scrollbar-none flex w-full snap-x snap-mandatory overflow-x-auto rounded-[40px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {snacks.map((snack, position) => (
          <li key={snack.id} className="relative aspect-[3/2] w-full flex-none snap-center">
            <Image
              src={snack.imageUrl}
              alt={snack.name}
              fill
              sizes="(min-width: 1024px) 1000px, 100vw"
              className="object-cover"
              // Only the first is worth blocking render on; the rest
              // are off-screen until someone moves the track.
              priority={position === 0}
            />
            {/* Named, because "what's inside" is a question a picture
                alone only half answers. */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-5 pt-16">
              <p className="text-base font-semibold text-white">{snack.name}</p>
              {snack.origin ? <p className="text-sm text-white/70">{snack.origin}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      {snacks.length > 1 ? (
        <>
          <SlideButton side="left" onClick={() => step(-1)} />
          <SlideButton side="right" onClick={() => step(1)} />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {snacks.map((snack, position) => (
              <button
                key={snack.id}
                type="button"
                onClick={() => {
                  setTaken(true);
                  scrollTo(position);
                }}
                aria-label={`Show ${snack.name}`}
                aria-current={position === index}
                className={cn(
                  'h-2 rounded-full transition-all',
                  position === index ? 'w-6 bg-secondary' : 'w-2 bg-foreground/20 hover:bg-foreground/40',
                )}
              />
            ))}
          </div>
        </>
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
        'absolute top-1/2 z-20 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-foreground shadow-md transition hover:bg-white md:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

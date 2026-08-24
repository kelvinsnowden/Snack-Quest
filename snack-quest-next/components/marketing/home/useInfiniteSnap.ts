'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SnapAxis = 'x' | 'y';

/**
 * A scroll-snap track with no end to reach.
 *
 * Browsing snacks is meant to be the part of this site a person sinks
 * into, and nothing breaks that faster than running out. A finite
 * track has two failure states that both read as "you're done here":
 * the last slide, where swiping does nothing, and the jump back to the
 * start, where the whole strip flies past.
 *
 * So the list is repeated, the track starts in the middle copy, and
 * once scrolling settles near either edge the scroll position is moved
 * by exactly one copy's length. The pixels under the finger are
 * identical before and after, so there is nothing to see — the strip
 * simply never ends.
 *
 * Two details make that invisible rather than merely clever:
 *
 * Re-centring waits for the scroll to settle. Moving the position
 * mid-fling cancels iOS momentum, which turns a smooth swipe into a
 * dead stop — worse than the seam it removes. Three copies leave a
 * whole list of runway past the middle, which no single fling crosses.
 *
 * Short lists get more copies, not fewer. Two snacks repeated three
 * times is only four slides of runway, which a fast fling *can* cross;
 * the repeat count is raised so the runway holds regardless.
 *
 * Built on native scroll-snap rather than a transformed track because
 * 98.6% of this site's traffic is mobile: momentum, rubber-banding and
 * interruptibility are what make swiping feel like the phone itself,
 * and no hand-rolled drag handler reproduces them convincingly.
 */
export function useInfiniteSnap({ count, axis }: { count: number; axis: SnapAxis }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const settleTimer = useRef<number | undefined>(undefined);
  const frame = useRef(0);

  // One slide is a photo, not a carousel — nothing to loop, and the
  // repeated copies would just be the same picture several times.
  const loops = count < 2 ? 1 : count >= 5 ? 3 : 5;
  const total = count * loops;
  const firstOfMiddle = Math.floor(loops / 2) * count;

  const metrics = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length < 2) return null;
    const first = track.children[0] as HTMLElement;
    const offsetOf = (i: number) => {
      const el = track.children[i] as HTMLElement | undefined;
      if (!el) return 0;
      return axis === 'x' ? el.offsetLeft - track.offsetLeft : el.offsetTop - track.offsetTop;
    };
    const stride = offsetOf(1) - offsetOf(0);
    if (stride <= 0) return null;

    /*
     * The scroll position that puts slide 0 where the track will
     * actually rest, which is centred — not where its left edge sits.
     *
     * Aligning edges instead was wrong by exactly the track's own side
     * padding: the position was set, the browser then snapped to
     * whichever slide's *centre* was nearest, and landed a slide
     * further on. Everything downstream inherited the error — the
     * caption named one snack while a different one was under it.
     *
     * Correct for the vertical viewer too, where each slide is exactly
     * as tall as the track: the halves cancel and this reduces to the
     * slide's own offset.
     */
    const size = axis === 'x' ? first.offsetWidth : first.offsetHeight;
    const client = axis === 'x' ? track.clientWidth : track.clientHeight;
    return { track, stride, base: offsetOf(0) + size / 2 - client / 2 };
  }, [axis]);

  const positionOf = useCallback(
    (slide: number) => {
      const m = metrics();
      return m ? m.base + slide * m.stride : 0;
    },
    [metrics],
  );

  const scrollToSlide = useCallback(
    (slide: number, behavior: ScrollBehavior) => {
      const track = trackRef.current;
      if (!track) return;
      const to = positionOf(slide);
      track.scrollTo(axis === 'x' ? { left: to, behavior } : { top: to, behavior });
    },
    [axis, positionOf],
  );

  /** Which slide of the rendered (repeated) track is under the viewport right now. */
  const currentSlide = useCallback((): number => {
    const m = metrics();
    if (!m) return 0;
    const pos = axis === 'x' ? m.track.scrollLeft : m.track.scrollTop;
    return Math.round((pos - m.base) / m.stride);
  }, [axis, metrics]);

  /** Open on the middle copy, so there is a full list of runway in *both* directions from the very first frame. */
  const start = useCallback(
    (sourceIndex: number) => {
      scrollToSlide(firstOfMiddle + sourceIndex, 'instant');
      setIndex(sourceIndex);
    },
    [firstOfMiddle, scrollToSlide],
  );

  /** Move by whole slides from wherever the track actually is — not from a remembered index, which a swipe would have left behind. */
  const step = useCallback(
    (delta: number) => {
      scrollToSlide(currentSlide() + delta, 'smooth');
    },
    [currentSlide, scrollToSlide],
  );

  /** Jump to a specific snack, taking whichever copy of it is nearest so the track never rewinds across the whole strip. */
  const goTo = useCallback(
    (sourceIndex: number) => {
      if (count < 1) return;
      const here = currentSlide();
      const copy = Math.floor(here / count);
      const candidates = [copy - 1, copy, copy + 1]
        .map((c) => c * count + sourceIndex)
        .filter((slide) => slide >= 0 && slide < total);
      if (candidates.length === 0) return;
      const nearest = candidates.reduce((best, slide) =>
        Math.abs(slide - here) < Math.abs(best - here) ? slide : best,
      );
      scrollToSlide(nearest, 'smooth');
    },
    [count, total, currentSlide, scrollToSlide],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function onScroll() {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        if (count < 1) return;
        const slide = currentSlide();
        // Modulo of a possibly-negative value: an over-scrolled
        // rubber-band puts the track before slide 0 for a moment.
        setIndex(((slide % count) + count) % count);
      });

      // Re-centre only once the finger is off and the momentum has
      // run out. See this hook's own comment for why mid-fling is the
      // one time this must not happen.
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        if (loops < 2) return;
        const m = metrics();
        if (!m) return;
        const slide = currentSlide();
        if (slide >= firstOfMiddle && slide < firstOfMiddle + count) return;
        const shifted = firstOfMiddle + (((slide % count) + count) % count);
        // Same picture, same offset within the slide: nothing moves on
        // screen, only the number in `scrollTop`/`scrollLeft`.
        scrollToSlide(shifted, 'instant');
      }, 140);
    }

    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(settleTimer.current);
      track.removeEventListener('scroll', onScroll);
    };
  }, [count, loops, firstOfMiddle, currentSlide, metrics, scrollToSlide]);

  return { trackRef, index, total, loops, step, goTo, start };
}

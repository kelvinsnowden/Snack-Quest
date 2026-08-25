'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, X } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';
import { useInfiniteSnap } from './useInfiniteSnap';
import type { SlideshowSnack } from './SnackSlideshow';

function subscribeNever(): () => void {
  return () => {};
}
function onClient(): boolean {
  return true;
}
function onServer(): boolean {
  return false;
}

/**
 * The snacks, full screen, one per swipe, forever (§ What's inside —
 * immersive gallery).
 *
 * This is the part meant to be sunk into. The inline strip on the
 * homepage is a shop window; this is the shop. Everything here follows
 * from two decisions:
 *
 * **It scrolls vertically.** On a phone — 98.6% of this site's traffic
 * — up-flick is the gesture the thumb already makes a thousand times a
 * day, and it is the one people fall into without deciding to. A
 * horizontal strip needs an aimed, deliberate movement, which is the
 * opposite of drifting. It can only be vertical *here*, in a
 * full-screen layer, because a vertical scroller nested in a scrolling
 * page is a trap: the page stops moving and the reader cannot get
 * past. Taking over the whole screen removes the page underneath, so
 * there is nothing to fight, and one obvious way out.
 *
 * **Buying stays one tap away.** Drifting is only worth anything here
 * if it ends in a box. The call to action is pinned to the bottom of
 * every slide rather than waiting at the end of the strip, because
 * there is deliberately no end of the strip to reach.
 *
 * Photographs are never cropped: each sits `contain` over a blurred,
 * scaled copy of itself, so a tall packet and a wide one both fill the
 * screen without either losing its label to the edge.
 */
export function SnackImmersiveViewer({
  snacks,
  startIndex,
  onClose,
  ctaHref,
  fromPriceKes,
}: {
  snacks: SlideshowSnack[];
  startIndex: number;
  onClose: () => void;
  ctaHref: string;
  fromPriceKes: number | null;
}) {
  const { trackRef, index, loops, start } = useInfiniteSnap({ count: snacks.length, axis: 'y' });
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Set when the history entry is already gone (Back was pressed) or must be left alone (the CTA is navigating). */
  const skipPop = useRef(false);
  /*
   * A portal needs a `document` to render into, and the server render
   * has not got one. Read the same way `Reveal` reads its own
   * server/client difference: `useSyncExternalStore` returns the
   * server value for the server render *and* for hydration — so the
   * two match exactly — then flips straight after, with none of the
   * cascading-render risk of setting state inside an effect.
   */
  const mounted = useSyncExternalStore(subscribeNever, onClient, onServer);

  useEffect(() => {
    if (!mounted) return;
    start(startIndex);
    closeRef.current?.focus();
  }, [mounted, start, startIndex]);

  /*
   * The page behind must not scroll while this is open — otherwise
   * dismissing lands the reader somewhere they never chose to be.
   * The previous value is restored rather than assumed to be `''`,
   * so this cannot clobber a lock something else set.
   */
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /*
   * The gallery gets its own history entry, so the phone's Back
   * gesture closes it.
   *
   * Without this the viewer was only React state, and Back — the
   * thing a person reaches for first on Android, before looking for
   * any control — left the site altogether. Somebody browsing snacks
   * did the most natural possible action and was thrown out of the
   * shop, which is the worst version of "no way back" there is.
   *
   * On the way out the entry is removed again, so closing by button
   * does not leave a dead step in the history for Back to land on.
   * Except when the call to action is what closed it: that navigates
   * on its own, and popping underneath it would cancel the jump to
   * the boxes. `skipPop` is set before that close, rather than
   * inferred from the URL afterwards, because the navigation and this
   * cleanup race otherwise.
   */
  useEffect(() => {
    window.history.pushState({ snackGallery: true }, '');
    function onPop() {
      skipPop.current = true;
      onClose();
    }
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!skipPop.current && window.history.state?.snackGallery) {
        window.history.back();
      }
    };
  }, [onClose]);

  if (!mounted) return null;

  const slides = Array.from({ length: snacks.length * loops }, (_, i) => ({
    snack: snacks[i % snacks.length],
    // Only the first screen is worth blocking on; the rest load as
    // they are swiped to.
    eager: i === 0,
    key: i,
  }));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Snacks that go into a Snack Quest box"
      className="bg-immersive text-immersive-foreground fixed inset-0 z-[100]"
    >
      <ul
        ref={trackRef}
        className="scrollbar-none h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: 'none' }}
      >
        {slides.map(({ snack, eager, key }) => (
          <li key={key} className="relative h-full w-full snap-start overflow-hidden">
            {/*
              The same photograph, blown out and blurred, as the wall
              behind itself. Fills any screen shape without cropping
              the real one, and tints the whole slide with that snack's
              own colours — which is most of why moving between them
              feels like moving between places.
            */}
            <Image
              src={snack.imageUrl}
              alt=""
              aria-hidden="true"
              fill
              sizes="64px"
              quality={20}
              className="scale-125 object-cover opacity-40 blur-3xl"
            />
            {/*
              Padded clear of the counter above and the panel below, so
              the photograph is optically centred in the space actually
              left for it rather than in the screen it shares.
            */}
            <Image
              src={snack.imageUrl}
              alt={snack.name}
              fill
              sizes="100vw"
              priority={eager}
              className="object-contain px-6 pt-20 pb-44"
            />
          </li>
        ))}
      </ul>

      {/*
        A real toolbar, over the photographs rather than between them:
        the way out has to be reachable from any slide, and there is no
        last slide to put it after.

        Two ways out, deliberately. The first build had only an
        unlabelled ✕ in the corner and people got stuck — an icon alone
        asks to be recognised, and over a bright photograph it barely
        registers as a control at all. A word does not have that
        problem, and "Back" says where it goes rather than merely that
        something will stop. The ✕ stays because the top-right corner
        is where a reader who *is* looking for a close button looks
        first; between them there is no reading of this screen that
        leaves someone hunting.

        The scrim is part of the fix, not decoration: white controls on
        an unknown photograph are legible only by luck.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/70 to-transparent"
      />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="text-immersive-foreground focus-visible:ring-immersive-foreground inline-flex h-11 items-center gap-1.5 rounded-full bg-black/45 pr-4 pl-3 text-base font-semibold backdrop-blur transition duration-150 ease-out hover:bg-black/65 focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          Back
        </button>

        <p className="text-immersive-foreground/80 text-caption font-semibold tracking-[0.2em] tabular-nums uppercase">
          {index + 1} / {snacks.length}
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close the snack gallery"
          className="text-immersive-foreground focus-visible:ring-immersive-foreground flex size-11 items-center justify-center rounded-full bg-black/45 backdrop-blur transition duration-150 ease-out hover:bg-black/65 focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/*
        Origin and call to action in one panel, fixed rather than
        repeated on every slide. Two reasons: a label sitting inside
        the track had to be positioned around a button it could not
        see, and did in fact land on top of it; and pinning it here
        means the one place a reader's eye already rests — where the
        button is — is also where they are told what they are looking
        at. It cross-fades as slides pass, which is what the label of a
        gallery should do.
      */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-5 pt-20 pb-7">
        {/*
          Origin, not name. The packet in the photograph already says
          what it is; where it travelled from is the part a picture
          cannot tell you, and the part this is about. `min-h` holds
          the space whether or not a given snack has one recorded, so
          the button never shifts under a thumb.
        */}
        <p
          aria-live="polite"
          className="text-immersive-foreground mb-3 min-h-7 text-center text-subtitle font-semibold"
        >
          {snacks[index]?.origin ?? ''}
        </p>
        <Link
          href={ctaHref}
          onClick={() => {
            // Its own navigation owns the history from here.
            skipPop.current = true;
            onClose();
          }}
          className="bg-primary text-primary-foreground focus-visible:ring-immersive-foreground flex w-full items-center justify-center rounded-full px-6 py-4 text-base font-bold shadow-lg transition duration-150 ease-out hover:brightness-105 focus-visible:ring-2 focus-visible:outline-none"
        >
          {fromPriceKes === null ? 'Pick your box' : `Pick your box — from ${formatKes(fromPriceKes)}`}
        </Link>
        <p className="text-immersive-foreground/60 mt-3 text-center text-caption">
          Swipe up to keep exploring
        </p>
      </div>
    </div>,
    document.body,
  );
}

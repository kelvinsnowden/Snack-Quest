'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatKes } from '@/lib/orders/format';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { RESCUE_OFFER_EVENTS } from '@/lib/analytics/rescueOfferEvents';
import { PRIMARY_CTA_CLASS } from '@/components/marketing/design/ctaStyles';

/**
 * How long a visitor has to be on the page before exit-intent
 * detection even arms (§ exit-intent rescue offer) — "Do NOT show the
 * popup immediately when someone lands on the site."
 */
const MIN_BROWSE_MS = 15_000;

/** Desktop: cursor leaving upward through the top edge of the viewport. */
const TOP_EDGE_PX = 8;

/** Mobile: how far down (relative to viewport height) counts as "actually scrolled the page", not just a landing bounce. */
const MEANINGFUL_SCROLL_RATIO = 0.5;
/** Mobile: how close back to the top (relative to how far they'd scrolled) counts as "heading back up". */
const NEAR_TOP_RATIO = 0.4;
/**
 * Mobile: scroll position is sampled on this fixed cadence rather than
 * reacting to native `scroll` events directly. Real touch browsers fire
 * `scroll` at wildly inconsistent intervals — especially mid-momentum,
 * where events can arrive in sparse, uneven bursts — so a velocity
 * computed from two consecutive event timestamps is unreliable and, in
 * practice, undercounts genuine fast swipes. Polling decouples the
 * measurement from that jitter.
 */
const SCROLL_POLL_MS = 120;
/** Mobile: how much of a viewport height moving upward within one poll tick reads as a deliberate swipe back up. */
const FAST_UPWARD_VIEWPORT_FRACTION = 0.1;
/**
 * Mobile fallback: a visitor who scrolls back near the top and simply
 * stops there — rather than swiping back up fast — is just as likely to
 * be about to leave. Requiring speed alone missed this case entirely,
 * so settling near the top for this long also counts.
 */
const NEAR_TOP_DWELL_MS = 550;

const SESSION_SHOWN_KEY = 'sq_rescue_offer_shown';
const SESSION_PURCHASED_KEY = 'sq_rescue_offer_purchased';

export interface ExitIntentOfferProps {
  packageId: string;
  name: string;
  priceKes: number;
  snackCountLabel: string | null;
  imageUrl: string | null;
  /** Precomputed server-side from the real `offerExpiresAt` — never a client-guessed or hardcoded claim (§ exit-intent rescue offer). */
  urgencyLabel: string;
}

function alreadyHandledThisSession(): boolean {
  try {
    return (
      sessionStorage.getItem(SESSION_SHOWN_KEY) === '1' || sessionStorage.getItem(SESSION_PURCHASED_KEY) === '1'
    );
  } catch {
    // Storage can throw in locked-down/private-browsing contexts — fail
    // open to "don't show" rather than risk a repeat-popup bug.
    return true;
  }
}

/**
 * The exit-intent rescue offer (§ exit-intent rescue offer) — mounted
 * once, globally, by `ExitIntentOfferMount` (a Server Component that
 * only renders this at all when a real, active, non-expired rescue
 * package exists). Detects intent to leave and shows a one-time offer
 * for it, at most once per browser session, and never on `/checkout`
 * itself (a visitor already mid-purchase for a different box doesn't
 * need a second offer interrupting that flow).
 *
 * Two independent triggers, since a cursor has no equivalent on a
 * touchscreen: desktop watches for the pointer leaving through the
 * top edge (the standard exit-intent signal); mobile watches for a
 * fast upward scroll back toward the top after the visitor has
 * actually scrolled down a meaningful amount — the closest honest
 * proxy for "about to leave" touch affords.
 */
export function ExitIntentOffer({ packageId, name, priceKes, snackCountLabel, imageUrl, urgencyLabel }: ExitIntentOfferProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ctaClickedRef = useRef(false);
  const shownRef = useRef(false);

  // Never on `/checkout` itself, and never on `/try` — that page's own
  // hero already leads with this exact offer, so popping it up on top
  // would just interrupt a visitor who came here specifically for it.
  const suppressed = (pathname?.startsWith('/checkout') || pathname === '/try') ?? false;

  useEffect(() => {
    if (suppressed || alreadyHandledThisSession()) {
      return;
    }

    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, MIN_BROWSE_MS);

    function trigger() {
      if (!armed || shownRef.current) return;
      shownRef.current = true;
      try {
        sessionStorage.setItem(SESSION_SHOWN_KEY, '1');
      } catch {
        // Best-effort — see alreadyHandledThisSession().
      }
      setOpen(true);
      trackEvent(RESCUE_OFFER_EVENTS.popupShown, { packageId });
      cleanup();
    }

    function onMouseOut(event: MouseEvent) {
      if (event.clientY <= TOP_EDGE_PX && !event.relatedTarget) {
        trigger();
      }
    }

    let maxY = window.scrollY;
    let lastPolledY = window.scrollY;
    let nearTopSinceMs: number | null = null;

    function onScroll() {
      maxY = Math.max(maxY, window.scrollY);
    }

    const pollTimer = window.setInterval(() => {
      const y = window.scrollY;
      const scrolledMeaningfully = maxY > window.innerHeight * MEANINGFUL_SCROLL_RATIO;
      const nearTopNow = scrolledMeaningfully && y < maxY * NEAR_TOP_RATIO;

      if (scrolledMeaningfully) {
        const movedUpSincePoll = lastPolledY - y;
        const fastUpward = movedUpSincePoll > window.innerHeight * FAST_UPWARD_VIEWPORT_FRACTION;
        if (nearTopNow && fastUpward) {
          trigger();
        } else if (nearTopNow) {
          if (nearTopSinceMs === null) {
            nearTopSinceMs = performance.now();
          } else if (performance.now() - nearTopSinceMs > NEAR_TOP_DWELL_MS) {
            trigger();
          }
        } else {
          nearTopSinceMs = null;
        }
      }

      lastPolledY = y;
    }, SCROLL_POLL_MS);

    function cleanup() {
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(pollTimer);
    }

    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.clearTimeout(armTimer);
      cleanup();
    };
  }, [suppressed, packageId]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && !ctaClickedRef.current) {
      trackEvent(RESCUE_OFFER_EVENTS.popupDismissed, { packageId });
    }
  }

  function onCtaClick() {
    ctaClickedRef.current = true;
    trackEvent(RESCUE_OFFER_EVENTS.offerClicked, { packageId });
  }

  if (suppressed) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm overflow-hidden rounded-2xl border-0 p-0 sm:max-w-md">
        <DialogTitle className="sr-only">Try Snack Quest with the 7-snack box</DialogTitle>
        <DialogDescription className="sr-only">
          A one-time {formatKes(priceKes)} offer for a 7-snack Snack Quest box, separate from our regular boxes.
        </DialogDescription>

        <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-secondary via-secondary to-home-purple-deep">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill sizes="400px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl" aria-hidden="true">
              🍿
            </div>
          )}
          {/* Darkened at both edges, not just the bottom — the urgency
              pill (top-left) and the dialog's own close button
              (top-right, rendered by `DialogContent`) both need to
              read clearly against whatever photo or gradient sits
              behind them, not just the caption area at the bottom. */}
          <div className="from-foreground/50 via-foreground/0 to-foreground/70 absolute inset-0 bg-gradient-to-b" />
          <span className="bg-home-lime text-foreground absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase shadow-sm">
            <Sparkles className="size-3" aria-hidden="true" />
            {urgencyLabel}
          </span>
        </div>

        <div className="flex flex-col gap-4 p-6 pt-5">
          <div>
            <h2 className="font-display text-foreground text-2xl leading-[1.05] font-normal uppercase">
              Wait — want to try <span className="text-secondary">Snack Quest</span> first?
            </h2>
            <p className="text-foreground/70 mt-2 text-sm leading-snug">
              We&apos;re giving you one chance to test Snack Quest before you commit to a bigger box.
            </p>
          </div>

          <div className="border-border bg-surface flex items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <p className="text-foreground text-sm font-semibold">
                {snackCountLabel ?? '7 assorted snacks'}
              </p>
              <p className="text-muted-foreground text-xs">Today&apos;s special — {name}</p>
            </div>
            <p className="text-foreground text-2xl font-bold tabular-nums">{formatKes(priceKes)}</p>
          </div>

          <Link
            href={`/checkout?box=${encodeURIComponent(packageId)}`}
            onClick={onCtaClick}
            className={`inline-flex h-12 w-full items-center justify-center rounded-full text-center text-sm font-bold tracking-wide uppercase text-white ${PRIMARY_CTA_CLASS}`}
          >
            Get the 7-snack box — {formatKes(priceKes)}
          </Link>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground mx-auto text-sm underline-offset-2 hover:underline"
          >
            No thanks, I&apos;ll keep browsing
          </button>

          <p className="text-muted-foreground text-center text-xs">
            Separate from our regular boxes — this offer isn&apos;t shown again.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Fires one beacon per page a visitor lands on, to our own
 * first-party `/api/analytics/track` (§ Admin: Analytics, website
 * traffic; § close the loop: ad-conversion attribution) — feeds the
 * "Visitors" numbers on the Admin dashboard, distinct from the Meta/
 * TikTok Pixel scripts in the layout above it, which report to those
 * platforms directly and aren't something this app can read back.
 *
 * Also carries `ttclid`/`fbclid` off the current URL when present —
 * TikTok and Meta append these to a landing page URL when an ad is
 * clicked. The route stores them as first-party cookies, first-touch,
 * so `startWebCheckout` can read them back later and attribute the
 * eventual order to the ad that actually drove the click.
 *
 * Renders nothing. `usePathname()` re-fires this on every client-side
 * navigation the App Router does, not just the first paint, so a
 * visitor who clicks through five pages without a full reload still
 * counts as five page views — `ttclid`/`fbclid` are only ever present
 * on the very first of those (the landing URL), which is exactly the
 * one that should set the cookie.
 *
 * Best-effort and silent: a visitor count that occasionally misses a
 * beacon is a minor accuracy gap; a tracking call that throws where a
 * real visitor would see it is a worse bug than the one this fixes.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        ttclid: params.get('ttclid') || undefined,
        fbclid: params.get('fbclid') || undefined,
      }),
      keepalive: true,
    }).catch(() => {
      // Nothing to do — see the doc comment above.
    });
  }, [pathname]);

  return null;
}

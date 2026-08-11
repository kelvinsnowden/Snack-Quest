'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Fires one beacon per page a visitor lands on, to our own
 * first-party `/api/analytics/track` (§ Admin: Analytics, website
 * traffic) — feeds the "Visitors" numbers on the Admin dashboard,
 * distinct from the Meta Pixel `PageView` event in the layout above
 * it, which reports to Facebook for ad optimization and isn't
 * something this app can read back.
 *
 * Renders nothing. `usePathname()` re-fires this on every client-side
 * navigation the App Router does, not just the first paint, so a
 * visitor who clicks through five pages without a full reload still
 * counts as five page views.
 *
 * Best-effort and silent: a visitor count that occasionally misses a
 * beacon is a minor accuracy gap; a tracking call that throws where a
 * real visitor would see it is a worse bug than the one this fixes.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: pathname, referrer: document.referrer || null }),
      keepalive: true,
    }).catch(() => {
      // Nothing to do — see the doc comment above.
    });
  }, [pathname]);

  return null;
}

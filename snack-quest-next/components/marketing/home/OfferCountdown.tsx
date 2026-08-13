'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * A live, ticking countdown to a package's real `offerExpiresAt` (§
 * exit-intent rescue offer) — never a fabricated deadline. Renders
 * nothing until it has mounted in the browser and read the visitor's
 * own clock: computing the remaining time during the server render
 * would bake in the server's clock instant, which can't match what
 * the visitor's browser recomputes on hydration and would violate the
 * same render-purity rule `lib/packages/offerExpiry.ts` documents
 * elsewhere in this feature.
 */
export function OfferCountdown({ expiresAtMs }: { expiresAtMs: number }) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemainingMs(Math.max(0, expiresAtMs - Date.now()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAtMs]);

  if (remainingMs === null) {
    return null;
  }

  if (remainingMs <= 0) {
    return (
      <p className="text-small text-foreground/60 font-semibold tracking-wide uppercase">
        Offer ended
      </p>
    );
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div
      role="timer"
      aria-label={`Offer ends in ${days > 0 ? `${days} days, ` : ''}${pad(hours)} hours, ${pad(minutes)} minutes, ${pad(seconds)} seconds`}
      className="text-secondary flex items-center gap-1.5 text-small font-bold tabular-nums"
    >
      <Clock className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">
        {days > 0 ? `${days}d ` : ''}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
      <span className="text-foreground/60 font-normal normal-case">left</span>
    </div>
  );
}

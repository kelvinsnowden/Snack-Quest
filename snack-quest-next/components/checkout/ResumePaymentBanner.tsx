'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { formatKes } from '@/lib/orders/format';
import {
  forgetPendingCheckout,
  readPendingCheckout,
  type PendingCheckout,
} from '@/lib/checkout/resumeSession';

/**
 * The way back to a payment the customer walked away from
 * (§ checkout second pass).
 *
 * Shown only to somebody who left a payment unfinished in this browser
 * in the last couple of hours, which is a small and specific group: it
 * is not a banner every customer has to read past on their way to
 * buying something.
 *
 * Rendered after mount rather than on the server, because whether it
 * applies is a fact about this browser and nothing else. That also
 * means it can never appear in the cached HTML of a page somebody else
 * is looking at.
 */
/*
 * Cached, because `useSyncExternalStore` calls `getSnapshot` on every
 * render and comparing a freshly-parsed object by identity would loop
 * forever. Re-read only when something changes it.
 */
let snapshot: PendingCheckout | null | undefined;
const listeners = new Set<() => void>();

function getSnapshot(): PendingCheckout | null {
  if (snapshot === undefined) {
    snapshot = readPendingCheckout();
  }
  return snapshot;
}

/** The server has no browser storage to read, so it renders nothing and hydration matches. */
function getServerSnapshot(): PendingCheckout | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clearSnapshot(): void {
  forgetPendingCheckout();
  snapshot = null;
  listeners.forEach((listener) => listener());
}

export function ResumePaymentBanner() {
  /*
   * `useSyncExternalStore` rather than an effect that sets state.
   * Whether this banner applies is a fact about the browser, not about
   * the render, and reading it through a store keeps the server output
   * empty, the hydration matched, and the render uncascaded.
   */
  const pending = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dismiss = useCallback(() => clearSnapshot(), []);

  if (!pending) {
    return null;
  }

  return (
    <div className="border-primary/30 bg-primary/5 mb-6 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-foreground text-sm font-semibold">You have a payment in progress</p>
        {/*
          Named and priced, so the customer recognises it as theirs
          before tapping. A bare "resume your order" asks them to trust
          a link on faith at the one moment they are already anxious
          about money.
        */}
        <p className="text-muted-foreground text-sm">
          {pending.label}
          {pending.totalKes > 0 ? ` · ${formatKes(pending.totalKes)}` : ''} · started{' '}
          {minutesAgo(pending.startedAtMs)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href={`/checkout/${pending.sessionId}`}
          className="bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-semibold"
        >
          Check payment status
        </Link>
        {/*
          Dismissing forgets it rather than merely hiding it. Somebody
          who says they are done with an order should not be asked
          about it again on their next visit.
        */}
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Start fresh
        </button>
      </div>
    </div>
  );
}

function minutesAgo(startedAtMs: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - startedAtMs) / 60_000));
  if (minutes === 1) return 'a minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  return 'over an hour ago';
}

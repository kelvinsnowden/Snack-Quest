'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKes } from '@/lib/orders/format';
import { MPESA_RECIPIENT_NAME } from '@/lib/config/mpesaRecipient';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import type { WebCheckoutStatusResponse } from '@/types/webCheckout';

/**
 * The "Waiting for payment…" screen (§ Website Becomes the Primary
 * Commerce Channel). Polls `GET /api/checkout/web/{sessionId}` and, the
 * moment the Daraja callback has been processed, calls
 * `router.refresh()` so the Server Component above swaps in the
 * success screen — no page reload, no manual refresh, and no state
 * this component has to reconstruct.
 *
 * Polling stops on its own three ways: success (handed off to the
 * refresh), a definite failure (nothing left to wait for), and a
 * timeout well past Safaricom's own ~2-minute STK expiry, after which
 * continuing to poll would be telling the customer to keep waiting for
 * something that is no longer coming.
 */

const POLL_INTERVAL_MS = 3_000;
/** Comfortably past Safaricom's STK prompt expiry (~2 min) plus callback delivery time. */
const POLL_TIMEOUT_MS = 4 * 60 * 1000;

export function PaymentWaiting({
  sessionId,
  initialStatus,
}: {
  sessionId: string;
  initialStatus: WebCheckoutStatusResponse;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [timedOut, setTimedOut] = useState(false);
  // Set on the effect's first run, not during render — the deadline is
  // "when this screen opened", and it must survive the effect
  // re-running as the status changes.
  const deadline = useRef<number | null>(null);

  useEffect(() => {
    if (status.paymentStatus === 'succeeded' || status.paymentStatus === 'failed') {
      return;
    }
    deadline.current ??= Date.now() + POLL_TIMEOUT_MS;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() > (deadline.current ?? 0)) {
        if (!cancelled) setTimedOut(true);
        clearInterval(timer);
        return;
      }
      try {
        const response = await fetch(`/api/checkout/web/${sessionId}`, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const next = (await response.json()) as WebCheckoutStatusResponse;
        if (cancelled) {
          return;
        }
        setStatus(next);
        if (next.paymentStatus === 'succeeded') {
          clearInterval(timer);
          // Hand off to the server: it owns rendering the confirmation.
          router.refresh();
        }
      } catch {
        // A dropped poll is not a failed payment — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, status.paymentStatus, router]);

  if (status.paymentStatus === 'failed' || timedOut) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="bg-danger/10 text-danger flex size-16 items-center justify-center rounded-full">
          <AlertCircle className="size-8" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-3">
          <h1 className="text-page-title text-foreground font-bold tracking-tight">
            {timedOut ? 'We didn’t hear back from M-Pesa' : 'Payment wasn’t completed'}
          </h1>
          <p className="text-muted-foreground text-base">
            {timedOut
              ? 'The prompt may have expired before you entered your PIN. Nothing has been charged — you can start again, or message us and we’ll sort it out.'
              : "The M-Pesa prompt may not have reached your phone, or it was cancelled before you entered your PIN. Either way, nothing was charged — you can try again."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/checkout">Try again</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a
              href={buildWhatsAppOrderUrl(`Hi! My payment for order ${sessionId.slice(0, 8)} didn't go through.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Message us on WhatsApp
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <span className="bg-primary/10 text-primary relative flex size-20 items-center justify-center rounded-full">
        <Smartphone className="size-9" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="text-page-title text-foreground font-bold tracking-tight">Waiting for payment…</h1>
        {/*
          The recipient name belongs here, not on the form before this.
          The prompt is on the customer's screen right now saying
          "Snowden Collections", and the question it raises — "who is
          that, I ordered from Snack Quest" — is being asked at this
          exact moment, with a PIN pad open. Said one screen earlier it
          was a caveat to read past before committing; said here it is
          an answer arriving when the question does.
        */}
        <p className="text-muted-foreground text-base">
          Check your phone for the M-Pesa prompt. It will show{' '}
          <span className="text-foreground font-semibold">{MPESA_RECIPIENT_NAME}</span> — that is Snack Quest&rsquo;s
          registered M-Pesa name. Enter your PIN to pay for your box.
        </p>
        <p className="text-muted-foreground text-sm">
          This page updates on its own — no need to refresh.
        </p>
      </div>

      {status.totalKes !== null ? (
        <div className="border-border bg-surface w-full rounded-lg border p-6">
          <dl className="flex flex-col gap-3">
            {status.packageLabel ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground text-sm">Order</dt>
                <dd className="text-foreground text-sm font-medium">{status.packageLabel}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground text-sm">Amount</dt>
              <dd className="text-foreground text-lg font-semibold">{formatKes(status.totalKes)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Confirming with M-Pesa
      </p>

      <p className="text-muted-foreground text-sm">
        Didn&apos;t get a prompt?{' '}
        <a
          href={buildWhatsAppOrderUrl(`Hi! I'm waiting on an M-Pesa prompt for order ${sessionId.slice(0, 8)}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          Message us on WhatsApp
        </a>
        .
      </p>
    </div>
  );
}

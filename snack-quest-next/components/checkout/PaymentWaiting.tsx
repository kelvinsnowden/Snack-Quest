'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { formatKes } from '@/lib/orders/format';
import { MPESA_RECIPIENT_NAME } from '@/lib/config/mpesaRecipient';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';
import { STK_ATTEMPT_ABANDON_AFTER_MS } from '@/lib/checkout/stkTiming';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { PaymentShell } from './payment/PaymentShell';
import {
  DetailCard,
  DetailRow,
  MpesaMark,
  StatusBadge,
  StatusHeadline,
} from './payment/PaymentParts';
import { SnackBoxHero } from './payment/SnackBoxHero';
import type { WebCheckoutStatusResponse } from '@/types/webCheckout';

/**
 * The "waiting for payment" screen and, when it does not arrive, the
 * failure screen (§ payment screen rebuild). Polls
 * `GET /api/checkout/web/{sessionId}` and, the moment the Daraja
 * callback has been processed, calls `router.refresh()` so the Server
 * Component above swaps in the success screen — no page reload, no
 * manual refresh, and no state this component has to reconstruct.
 *
 * Polling stops on its own three ways: success (handed off to the
 * refresh), a definite failure (nothing left to wait for), and a
 * timeout past Safaricom's own STK expiry, after which continuing to
 * poll would be telling the customer to keep waiting for something
 * that is no longer coming.
 */

const POLL_INTERVAL_MS = 3_000;
/**
 * The same window the server uses to decide a started prompt is dead
 * (`lib/checkout/stkTiming.ts`). Shared rather than duplicated because
 * the two disagreeing is what stranded customers: this screen offered
 * "start again" while the checkout endpoint was still refusing one.
 */
const POLL_TIMEOUT_MS = STK_ATTEMPT_ABANDON_AFTER_MS;

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

  const reference = sessionId.slice(0, 8).toUpperCase();

  if (status.paymentStatus === 'failed' || timedOut) {
    return <PaymentFailed reference={reference} totalKes={status.totalKes} timedOut={timedOut} />;
  }

  return (
    <PaymentShell>
      <StatusBadge tone="waiting" />

      <StatusHeadline
        lead="Check"
        rest="Your Phone"
        leadClassName="text-primary"
        restClassName="text-white"
      />

      {/*
        The recipient name belongs here, not on the form before this.
        The prompt is on the customer's screen right now saying
        "Snowden Collections", and the question it raises — "who is
        that, I ordered from Snack Quest" — is being asked at this exact
        moment, with a PIN pad open. Said one screen earlier it was a
        caveat to read past before committing; said here it is an answer
        arriving when the question does.
      */}
      <p className="mt-4 text-base text-pretty text-white/75">
        You&rsquo;re paying <span className="font-bold text-white">{MPESA_RECIPIENT_NAME}</span> for your Snack
        Quest box. Check your phone for the M-Pesa prompt and enter your PIN to complete payment.
      </p>

      {status.totalKes !== null ? (
        <div className="mt-7 w-full">
          <DetailCard>
            <DetailRow label="Amount" valueClassName="text-home-lime">
              {formatKes(status.totalKes)}
            </DetailRow>
            {status.packageLabel ? <DetailRow label="Order">{status.packageLabel}</DetailRow> : null}
            <DetailRow label="Payment Method">
              <MpesaMark />
            </DetailRow>
          </DetailCard>
        </div>
      ) : null}

      {/*
        The dot sits inside the same centred line as its label rather
        than as a sibling flex child: as a sibling it stays vertically
        centred against the whole block, so the moment the label wrapped
        to two lines the dot detached and floated off at the left edge.
      */}
      <p className="mt-6 text-sm text-white/50" aria-live="polite">
        <span className="relative mr-2 inline-flex size-2 align-middle">
          <span className="absolute inline-flex size-full rounded-full bg-home-lime opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-home-lime" />
        </span>
        Confirming with M-Pesa
      </p>
      <p className="mt-1 text-sm text-white/40">This page updates on its own.</p>

      <SnackBoxHero className="mt-8 opacity-90" />

      <a
        href={buildWhatsAppOrderUrl(`Hi! I'm waiting on an M-Pesa prompt for order ${reference}.`)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-flex items-center gap-2 py-2 text-sm font-semibold text-[#b98cff] hover:text-white"
      >
        <WhatsAppIcon className="size-4" />
        Didn&rsquo;t get a prompt? Message us
      </a>
    </PaymentShell>
  );
}

/**
 * The failure screen.
 *
 * Two distinct causes, one layout: the prompt expired before a PIN was
 * entered, or Safaricom reported an outright failure. Both end with
 * nothing charged and the same next step, so they differ only in the
 * sentence that explains what happened — inventing two screens for one
 * action would be structure for its own sake.
 */
function PaymentFailed({
  reference,
  totalKes,
  timedOut,
}: {
  reference: string;
  totalKes: number | null;
  timedOut: boolean;
}) {
  return (
    <PaymentShell>
      <StatusBadge tone="failed" />

      <StatusHeadline
        lead="Payment"
        rest="Not Completed"
        leadClassName="text-[#ff4d5e]"
        restClassName="text-white"
      />

      <p className="mt-4 text-base font-semibold text-[#b98cff]">Oops! Something went wrong.</p>
      <p className="mt-1 text-sm text-pretty text-white/65">
        {timedOut
          ? 'The prompt may have expired before you entered your PIN. Nothing has been charged.'
          : 'The prompt may not have reached your phone, or it was cancelled before you entered your PIN. Either way, nothing was charged.'}
      </p>

      <div className="mt-7 w-full">
        <DetailCard>
          <DetailRow label="Order ID">
            <span className="font-mono">{reference}</span>
          </DetailRow>
          {totalKes !== null ? (
            <DetailRow label="Amount" valueClassName="text-[#ff4d5e]">
              {formatKes(totalKes)}
            </DetailRow>
          ) : null}
          <DetailRow label="Payment Method">
            <MpesaMark />
          </DetailRow>
          <DetailRow label="Status">
            <span className="rounded-md bg-[#ff4d5e]/15 px-2.5 py-1 text-xs font-bold tracking-wide text-[#ff4d5e] uppercase">
              Failed
            </span>
          </DetailRow>
        </DetailCard>
      </div>

      <SnackBoxHero className="mt-8 opacity-75" />

      <Link
        href="/checkout"
        className="mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#ff4d5e] text-base font-bold text-white transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0510] focus-visible:outline-none"
      >
        <RefreshCw className="size-5" aria-hidden="true" />
        Try Again
      </Link>

      {/*
        The mock's second action reads "Change Payment Method". M-Pesa
        is the only method this storefront accepts, so that button would
        open nothing — WhatsApp is the real alternative route to paying,
        and it is what the label offers.
      */}
      <a
        href={buildWhatsAppOrderUrl(`Hi! My payment for order ${reference} didn't go through.`)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-2 py-2 text-sm font-semibold text-[#b98cff] hover:text-white"
      >
        <WhatsAppIcon className="size-4" />
        Pay another way on WhatsApp
      </a>
    </PaymentShell>
  );
}

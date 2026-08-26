'use client';

import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { FUNNEL_EVENTS } from '@/lib/analytics/funnelEvents';
import type { DeliveryMethod } from '@/types/delivery';
import type { WebCheckoutQuote } from '@/types/webCheckout';

/**
 * Keeps a server-computed price in step with what the customer has
 * selected (§ Website Becomes the Primary Commerce Channel).
 *
 * The point is that the checkout page never does the arithmetic. Every
 * time a selection changes, the server re-prices it — the pickup fee
 * from `pickupStations`, the referral discount from `referralLinks`,
 * any wallet credit from the customer's own balance — and the page
 * renders whatever came back. That is the same computation the charge
 * itself runs, so what the customer reads is what M-Pesa asks for.
 *
 * Debounced because it fires on keystrokes in the referral and phone
 * fields, and sequenced because a slow early response must never
 * overwrite a fast later one — showing a stale price is the one
 * failure this hook exists to prevent.
 */

const QUOTE_DEBOUNCE_MS = 300;

export interface QuoteSelection {
  packageId: string | null;
  quantity: number;
  deliveryMethod: DeliveryMethod;
  /** Boxes beyond the primary one (§ more than one box per order). Re-quoted whenever they change, because they change the total. */
  extras?: { packageId: string; quantity: number }[];
  /** Door delivery only — the quote must price the speed the customer actually picked, or it disagrees with the charge. */
  serviceLevel?: 'next-day' | 'same-day';
  pickupStationId?: string;
  referralCode: string;
  phone: string;
}

export function useCheckoutQuote(selection: QuoteSelection): WebCheckoutQuote | null {
  const [quote, setQuote] = useState<WebCheckoutQuote | null>(null);

  // Serialized so the effect re-runs on a real change of selection
  // rather than on every re-render that rebuilds the object.
  const key = JSON.stringify(selection);

  // Which quote failures have already been reported this mount. The
  // quote refires on every keystroke in the referral/phone fields, so
  // a persistent failure would otherwise report itself once per
  // character typed and drown out how many people it really affected
  // (§ Mission 2 — funnel analytics, "avoid duplicate firing").
  const reportedErrors = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = JSON.parse(key) as QuoteSelection;
    if (!current.packageId) {
      return;
    }

    let cancelled = false;

    // Reported with a coarse category and the selection that produced
    // it — never the response body, the phone number or the referral
    // code, none of which belong in an analytics record.
    function reportQuoteError(category: 'http_error' | 'network_error' | 'empty_response') {
      const signature = `${category}:${current.deliveryMethod}:${current.serviceLevel ?? ''}:${current.packageId}`;
      if (reportedErrors.current.has(signature)) {
        return;
      }
      reportedErrors.current.add(signature);
      trackEvent(FUNNEL_EVENTS.quoteError, {
        category,
        deliveryMethod: current.deliveryMethod,
        ...(current.packageId ? { packageId: current.packageId } : {}),
      });
    }

    // Guards the `empty_response` branch below from also firing for a
    // failure that has already reported itself with a more specific
    // category — a non-OK response resolves to `null` too.
    let alreadyReported = false;

    const timer = setTimeout(() => {
      fetch('/api/checkout/web/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: current.packageId,
          quantity: current.quantity,
          deliveryMethod: current.deliveryMethod,
          ...(current.extras?.length
            ? { items: [{ packageId: current.packageId, quantity: current.quantity }, ...current.extras] }
            : {}),
          ...(current.serviceLevel ? { serviceLevel: current.serviceLevel } : {}),
          pickupStationId: current.pickupStationId,
          referralCode: current.referralCode || undefined,
          phone: current.phone || undefined,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            if (!cancelled) {
              alreadyReported = true;
              reportQuoteError('http_error');
            }
            return null;
          }
          return response.json() as Promise<WebCheckoutQuote | null>;
        })
        .then((next) => {
          if (cancelled) {
            return;
          }
          // A 200 that carries no quote still leaves the customer
          // without a live total, so it is the same failure to them.
          if (next === null && !alreadyReported) {
            reportQuoteError('empty_response');
          }
          if (next) {
            /*
             * The customer has just been shown what they will really
             * be charged (§ web funnel in Admin analytics). Recorded
             * here rather than in the quote route so the event carries
             * the same `visitorId` as every other funnel step and can
             * be lined up with them; the route has no visitor identity
             * of its own to attach.
             *
             * Every successful quote, not one per visit — this counts
             * quotes served, matching what the server logs count.
             */
            trackEvent(FUNNEL_EVENTS.deliveryQuoteServed, {
              // `current`, not `selection`: the effect closes over the
              // selection it was scheduled with, and this fires after
              // an await.
              deliveryMethod: current.deliveryMethod,
              totalKes: next.pricing.totalKes,
            });
          }
          setQuote(next);
        })
        .catch(() => {
          // A failed quote leaves the last good one on screen; the
          // charge is priced server-side regardless, so this is a
          // display gap, not a correctness one.
          if (!cancelled && !alreadyReported) {
            alreadyReported = true;
            reportQuoteError('network_error');
          }
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return quote;
}

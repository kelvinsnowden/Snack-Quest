'use client';

import { useEffect, useState } from 'react';
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
  pickupStationId?: string;
  referralCode: string;
  phone: string;
}

export function useCheckoutQuote(selection: QuoteSelection): WebCheckoutQuote | null {
  const [quote, setQuote] = useState<WebCheckoutQuote | null>(null);

  // Serialized so the effect re-runs on a real change of selection
  // rather than on every re-render that rebuilds the object.
  const key = JSON.stringify(selection);

  useEffect(() => {
    const current = JSON.parse(key) as QuoteSelection;
    if (!current.packageId) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetch('/api/checkout/web/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageId: current.packageId,
          quantity: current.quantity,
          deliveryMethod: current.deliveryMethod,
          pickupStationId: current.pickupStationId,
          referralCode: current.referralCode || undefined,
          phone: current.phone || undefined,
        }),
      })
        .then((response) => (response.ok ? (response.json() as Promise<WebCheckoutQuote | null>) : null))
        .then((next) => {
          if (!cancelled) {
            setQuote(next);
          }
        })
        .catch(() => {
          // A failed quote leaves the last good one on screen; the
          // charge is priced server-side regardless, so this is a
          // display gap, not a correctness one.
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return quote;
}

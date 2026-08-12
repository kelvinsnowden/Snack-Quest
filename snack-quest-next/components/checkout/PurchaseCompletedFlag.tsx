'use client';

import { useEffect } from 'react';

const SESSION_PURCHASED_KEY = 'sq_rescue_offer_purchased';

/**
 * Renders nothing — marks this browser session as having completed a
 * purchase (§ exit-intent rescue offer's "must not appear after the
 * visitor has already completed/purchased an order"), read by
 * `ExitIntentOffer.tsx`. Mounted inside `CheckoutSuccess`, a Server
 * Component with no client JS of its own to set `sessionStorage` from,
 * same "small client sentinel next to a server-rendered screen"
 * pattern as `PageViewTracker`.
 *
 * Applies to *any* completed order, not just the rescue offer's own —
 * a visitor who already bought a bigger box this session shouldn't
 * then be offered the cheaper trial box on their way out.
 */
export function PurchaseCompletedFlag() {
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_PURCHASED_KEY, '1');
    } catch {
      // Best-effort, same as every other sessionStorage touch here.
    }
  }, []);

  return null;
}

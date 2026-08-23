'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * `/checkout/{sessionId}` — the payment result screens.
 *
 * A session id is one path segment with nothing after it, which is
 * what separates these from `/checkout` itself.
 */
function isPaymentScreen(pathname: string | null): boolean {
  return /^\/checkout\/[^/]+$/.test(pathname ?? '');
}

/**
 * Drops the site footer on the payment result screens (§ payment
 * screen rebuild).
 *
 * Those three screens are a moment, not a page: a dark, full-bleed
 * surface sized to the viewport. The marketing footer rendered below
 * it anyway, so a customer watching for their payment to confirm could
 * scroll past the answer into a light wall of nav links and social
 * icons — dead space that made a finished screen look broken.
 *
 * A client wrapper rather than a separate route group, because these
 * pages must stay inside the marketing layout: that is where the Meta
 * and TikTok pixels live, and the success screen is the one page in
 * the funnel where a purchase conversion actually fires.
 *
 * The header stays. It is one 4rem bar the section already subtracts
 * from its own height, so it costs no scroll, and after a successful
 * payment it is the way back into the shop.
 */
export function PaymentScreenChrome({ children }: { children: ReactNode }) {
  if (isPaymentScreen(usePathname())) {
    return null;
  }
  return <>{children}</>;
}

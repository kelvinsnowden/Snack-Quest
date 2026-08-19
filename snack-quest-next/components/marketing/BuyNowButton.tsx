'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { FUNNEL_EVENTS, type BoxSelectedSource } from '@/lib/analytics/funnelEvents';

/**
 * The site-wide purchase CTA (§ Website Becomes the Primary Commerce
 * Channel). Replaces `WhatsAppOrderButton` everywhere the intent is
 * "buy this" — the website is now where an order is placed, priced and
 * paid for, and WhatsApp is support and engagement.
 *
 * `WhatsAppOrderButton` deliberately stays for the CTAs that really are
 * conversations: asking a question, chasing an order, arranging a Bolt
 * rider. Those were never purchases pretending to be chats.
 *
 * Links to `/checkout?box=<id>` when a specific box is being sold, or
 * bare `/checkout` when the CTA is generic — the checkout page
 * pre-selects from that parameter and falls back to the first active
 * box, so neither form can land the customer on an empty page.
 *
 * A Client Component since § Mission 2 — funnel analytics: this is the
 * one component every "buy this" click in the product passes through,
 * so `box_selected` is fired here rather than reimplemented at each
 * call site. The cost is small and mostly already paid — it renders
 * `Button`/`Link`/an icon that ship anyway, it is already imported by
 * Client Components (`MarketingHeader`, `CreatorOffers`), and it is
 * still server-rendered into the HTML, so nothing about the markup,
 * SEO or first paint changes. Pages that use it stay Server Components.
 */
export function BuyNowButton({
  packageId,
  size = 'lg',
  variant = 'primary',
  className,
  onClick,
  analyticsSource,
  analyticsPriceKes,
  children = 'Buy now',
}: {
  packageId?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  /** For callers that need to react to the navigation — e.g. the header closing its mobile menu, which a client-side route change won't do on its own. */
  onClick?: () => void;
  /** Which surface this CTA sits on. Omit only where the click isn't worth attributing; the event is skipped entirely rather than recorded against an unknown source. */
  analyticsSource?: BoxSelectedSource;
  /** The box's catalog price, when the caller already has it. Display/reporting only — never used to price anything. */
  analyticsPriceKes?: number;
  children?: React.ReactNode;
}) {
  const href = packageId ? `/checkout?box=${encodeURIComponent(packageId)}` : '/checkout';

  function handleClick() {
    // Analytics must never be able to stop someone buying, so this is
    // ordered and written defensively: `trackEvent` is itself
    // fire-and-forget and swallows its own failures, and the caller's
    // own `onClick` runs regardless of what happens here.
    if (analyticsSource) {
      trackEvent(FUNNEL_EVENTS.boxSelected, {
        source: analyticsSource,
        ...(packageId ? { packageId } : {}),
        ...(typeof analyticsPriceKes === 'number' ? { priceKes: analyticsPriceKes } : {}),
      });
    }
    onClick?.();
  }

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link href={href} onClick={handleClick}>
        <ShoppingBag className="size-4" aria-hidden="true" />
        {children}
      </Link>
    </Button>
  );
}

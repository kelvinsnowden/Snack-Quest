import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { WhatsAppCheckoutButton } from '@/components/marketing/WhatsAppCheckoutButton';
import { GENERIC_ORDER_MESSAGE } from '@/lib/whatsapp/orderLink';

/**
 * Persistent mobile CTA bar (§ spec §7.8) — hidden ≥768px, where the
 * floating bubble takes over (never both visible at once, see
 * FloatingWhatsAppBubble's own comment).
 *
 * Carries both ways to buy (§ order on WhatsApp): the checkout, and
 * ordering in a thread. On a site that is 98.6% mobile this bar is the
 * only call to action always on screen, so a channel that is not on it
 * is not really "easily accessible" however many times it appears
 * further down the page.
 *
 * It replaced "Pick a box", which was a scroll link to a section the
 * same page already scrolls to. Three controls do not fit across
 * 390px without all three becoming too small to hit, and of the two,
 * the one that only moved the page was the one worth losing.
 */
export function MobileStickyBar({ packageId }: { packageId?: string } = {}) {
  const buyHref = packageId ? `/checkout?box=${encodeURIComponent(packageId)}` : '/checkout';

  return (
    <div className="border-foreground/10 fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 backdrop-blur-sm md:hidden">
      <div
        className="flex items-center gap-2 px-3 pt-2.5"
        style={{
          paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))',
        }}
      >
        {/*
          Labelled, not an icon alone. The icon is recognisable but says
          only "WhatsApp" — the word is what says this is a way to buy
          rather than a support line, and that distinction is the whole
          reason it is here.
        */}
        <WhatsAppCheckoutButton
          source="mobile_sticky_bar"
          message={GENERIC_ORDER_MESSAGE}
          className="text-small shrink-0 px-3.5 py-2.5"
        >
          Order on chat
        </WhatsAppCheckoutButton>
        <Link
          href={buyHref}
          className="bg-primary text-small flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 font-semibold text-white shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)]"
        >
          <ShoppingBag className="size-4" aria-hidden="true" />
          Buy now
        </Link>
      </div>
    </div>
  );
}

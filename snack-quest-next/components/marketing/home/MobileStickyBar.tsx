import Link from 'next/link';
import { Boxes, ShoppingBag } from 'lucide-react';

/**
 * Persistent mobile CTA bar (§ spec §7.8) — hidden ≥768px, where the
 * floating bubble takes over (never both visible at once, see
 * FloatingWhatsAppBubble's own comment). Plain server component: two
 * links, no client state needed.
 *
 * The primary action is the checkout, not WhatsApp (§ Website Becomes
 * the Primary Commerce Channel) — the floating WhatsApp bubble on
 * larger screens and the support CTAs elsewhere still carry the
 * "talk to us" path.
 */
export function MobileStickyBar() {
  return (
    <div className="border-foreground/10 fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 backdrop-blur-sm md:hidden">
      <div
        className="flex items-center gap-2 px-3 pt-2.5"
        style={{
          paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))',
        }}
      >
        <Link
          href="#boxes"
          className="border-foreground/15 text-small text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border bg-white px-3 py-2.5 font-semibold"
        >
          <Boxes className="text-secondary size-4" aria-hidden="true" />
          Pick a box
        </Link>
        <Link
          href="/checkout"
          className="bg-primary text-small flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 font-semibold text-white shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)]"
        >
          <ShoppingBag className="size-4" aria-hidden="true" />
          Buy now
        </Link>
      </div>
    </div>
  );
}

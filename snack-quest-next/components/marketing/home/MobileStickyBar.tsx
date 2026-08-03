import Link from 'next/link';
import { Boxes, MessageCircle } from 'lucide-react';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/**
 * Persistent mobile CTA bar (§ spec §7.8) — hidden ≥768px, where the
 * floating bubble takes over (never both visible at once, see
 * FloatingWhatsAppBubble's own comment). Plain server component: two
 * anchors, no client state needed.
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
        <a
          href={buildWhatsAppOrderUrl(
            "Hi! I'd like to order a Snack Quest box.",
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-small flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 font-semibold text-white shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)]"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Order on WhatsApp
        </a>
      </div>
    </div>
  );
}

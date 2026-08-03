import { MessageCircle } from 'lucide-react';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/**
 * Persistent desktop CTA (§ spec §7.9) — visible ≥768px only, hidden
 * below it where the mobile sticky bar takes over. z-40, deliberately
 * below the sticky bar's z-50 and never rendered alongside it.
 */
export function FloatingWhatsAppBubble() {
  return (
    <a
      href={buildWhatsAppOrderUrl("Hi! I'd like to order a Snack Quest box.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Order on WhatsApp"
      className="bg-primary fixed right-6 bottom-6 z-40 hidden size-16 items-center justify-center rounded-full text-white shadow-[0_20px_60px_-15px_rgb(255_122_0/0.5)] transition-transform duration-200 hover:scale-[1.06] md:flex"
    >
      <span
        className="animate-pulse-glow absolute inset-0 rounded-full"
        aria-hidden="true"
      />
      <MessageCircle className="relative size-7" aria-hidden="true" />
    </a>
  );
}

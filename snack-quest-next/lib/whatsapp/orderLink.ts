import { WHATSAPP_CTA_NUMBER } from '@/lib/config/whatsapp';

/** The one real "order" mechanism the public site has — a wa.me deep link with a pre-filled message, same construction as `app/r/[code]/route.ts`'s referral click-through. No live storefront/cart exists to link to instead. */
export function buildWhatsAppOrderUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_CTA_NUMBER}?text=${encodeURIComponent(message)}`;
}

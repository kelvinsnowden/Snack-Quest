import { WHATSAPP_CTA_NUMBER } from '@/lib/config/whatsapp';

/** A `wa.me` deep link with a pre-filled message, same construction as `app/r/[code]/route.ts`'s referral click-through. */
export function buildWhatsAppOrderUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_CTA_NUMBER}?text=${encodeURIComponent(message)}`;
}

/**
 * The opening message for someone who would rather buy in a thread
 * than fill in a form (§ order on WhatsApp).
 *
 * Written as the *customer's* first line, because that is what it
 * becomes — WhatsApp puts this in their compose box under their name,
 * and anything phrased as marketing copy reads as a bot the moment
 * they send it.
 *
 * It carries the box and the price for one reason: the reply should be
 * able to be "Great — where are we sending it?" rather than three
 * messages establishing what they wanted. Every extra round trip is
 * somewhere the sale can go quiet.
 *
 * Quantity is included only when it is not 1. "Qty: 1" is noise in a
 * message a real person is about to send.
 */
export function buildBoxOrderMessage(box: {
  name: string;
  priceKes: number;
  quantity?: number;
}): string {
  const quantity = box.quantity && box.quantity > 1 ? box.quantity : 1;
  const lines = [
    `Hi Snack Quest! I'd like to order the ${box.name}.`,
    quantity > 1 ? `Quantity: ${quantity}` : null,
    `Price: KES ${box.priceKes.toLocaleString('en-KE')}${quantity > 1 ? ' each' : ''}`,
  ].filter(Boolean);
  return lines.join('\n');
}

/** For CTAs that sit where no single box is selected — the customer says which one in the thread. */
export const GENERIC_ORDER_MESSAGE = "Hi Snack Quest! I'd like to order a snack box. Which ones are available?";

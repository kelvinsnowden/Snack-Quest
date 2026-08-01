/** The one real "order" mechanism the public site has — a wa.me deep link with a pre-filled message, same construction as `app/r/[code]/route.ts`'s referral click-through. No live storefront/cart exists to link to instead. */
export function buildWhatsAppOrderUrl(whatsappCustomerNumber: string, message: string): string {
  return `https://wa.me/${whatsappCustomerNumber}?text=${encodeURIComponent(message)}`;
}

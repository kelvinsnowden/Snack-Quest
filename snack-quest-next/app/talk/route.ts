import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/**
 * A short link on our own domain (`snackquests.shop/talk`) that hands
 * the visitor to WhatsApp — built for the "Thank you" screen of the
 * vending founding-partner Meta lead form, which only takes a website
 * URL.
 *
 * Opens the thread with a first line written as the applicant's own,
 * so the reply can pick up from "you applied" instead of re-asking
 * what they want. `?m=` swaps in a different opening line for other
 * campaigns without a deploy; anything over 300 characters is ignored
 * rather than passed through.
 */
const DEFAULT_MESSAGE =
  "Hi Snack Quest! I just applied for the vending machine founding-partner programme and I'd like to talk.";

export function GET(request: Request): Response {
  const custom = new URL(request.url).searchParams.get('m')?.trim();
  const message = custom && custom.length <= 300 ? custom : DEFAULT_MESSAGE;
  return Response.redirect(buildWhatsAppOrderUrl(message), 302);
}

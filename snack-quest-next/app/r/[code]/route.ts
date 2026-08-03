import { referralService } from '@/services/referralService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp/orderLink';

/**
 * A creator's shareable referral link (§ Creator Portal referral
 * links) — the one place a real click gets counted before handing the
 * visitor off to WhatsApp, where the actual order happens (this
 * codebase has no live storefront to redirect to yet; a `wa.me/`
 * deep link with the code pre-filled into the message is the real,
 * working destination today, not a placeholder one). Public, no
 * session required — this is what a creator posts publicly.
 *
 * Fails soft on an unknown/inactive code, sending the visitor to `/`
 * rather than erroring — a mistyped or stale link should never dead-end
 * a customer, and the click was worth counting either way.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const businessId = getCurrentBusinessId();
  const origin = new URL(request.url).origin;

  const link = await referralService.recordClick(businessId, code);
  if (!link) {
    return Response.redirect(new URL('/', origin), 302);
  }

  const message = `Hi! I'd like to order a Snack Quest box. Referral code: ${link.code}`;
  return Response.redirect(buildWhatsAppOrderUrl(message), 302);
}

import { referralService } from '@/services/referralService';
import { businessRepository } from '@/repositories/businessRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * A creator's shareable referral link (§ Creator Portal referral
 * links) — the one place a real click gets counted before handing the
 * visitor off to WhatsApp, where the actual order happens (this
 * codebase has no live storefront to redirect to yet; a `wa.me/`
 * deep link with the code pre-filled into the message is the real,
 * working destination today, not a placeholder one). Public, no
 * session required — this is what a creator posts publicly.
 *
 * Fails soft everywhere: an unknown/inactive code, or a business with
 * no `whatsappCustomerNumber` configured yet, sends the visitor to `/`
 * rather than erroring — a mistyped or stale link should never dead-end
 * a customer, and the click was worth counting either way.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const businessId = getCurrentBusinessId();
  const origin = new URL(request.url).origin;

  const link = await referralService.recordClick(businessId, code);
  if (!link) {
    return Response.redirect(new URL('/', origin), 302);
  }

  const business = await businessRepository.findById(businessId);
  if (!business?.whatsappCustomerNumber) {
    console.warn(`[referral click-through] business ${businessId} has no whatsappCustomerNumber configured — falling back to "/"`);
    return Response.redirect(new URL('/', origin), 302);
  }

  const message = `Hi! I'd like to order a Snack Quest box. Referral code: ${link.code}`;
  const waUrl = `https://wa.me/${business.whatsappCustomerNumber}?text=${encodeURIComponent(message)}`;
  return Response.redirect(waUrl, 302);
}

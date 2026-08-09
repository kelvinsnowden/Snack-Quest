import { referralService } from '@/services/referralService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { buildReferralCookie } from '@/lib/creators/referralCookie';

/**
 * A creator's shareable referral link (§ Creator Portal referral
 * links) — the one place a real click gets counted before the visitor
 * is handed off to where the order actually happens. Public, no
 * session required: this is what a creator posts publicly.
 *
 * That destination is now the website's own checkout, with the code
 * pre-filled (§ Website Becomes the Primary Commerce Channel). It used
 * to be a `wa.me/` deep link carrying the code inside a message body,
 * because no storefront existed to send anyone to — which meant the
 * code only counted if the customer left it in the text they sent and
 * the bot then parsed it back out. Going straight to `/checkout?ref=`
 * puts the code into the frozen snapshot through the same
 * `referralService.validateCode` path, with nothing for the customer
 * to accidentally delete.
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

  const destination = new URL('/checkout', origin);
  destination.searchParams.set('ref', link.code);

  // The cookie covers the visitor who doesn't buy on this visit — see
  // `lib/creators/referralCookie.ts`. Set alongside the parameter, not
  // instead of it: the parameter is what makes this checkout obviously
  // attributed, the cookie is what makes the next one still attributed.
  return new Response(null, {
    status: 302,
    headers: {
      location: destination.toString(),
      'set-cookie': buildReferralCookie(link.code),
    },
  });
}

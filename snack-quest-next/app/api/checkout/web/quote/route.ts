import { conversationService } from '@/services/conversationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { verifyCreatorSessionFromRequest } from '@/lib/auth/creatorSession';
import type { WebCheckoutQuote } from '@/types/webCheckout';

/**
 * `POST /api/checkout/web/quote` (§ Website Becomes the Primary
 * Commerce Channel) — prices a selection without freezing a snapshot,
 * creating a payment intent, or sending an STK push.
 *
 * This exists so the referral discount and the pickup fee are visible
 * on the checkout page rather than appearing for the first time on the
 * payment screen. It runs the same catalog/station/referral reads and
 * the same `computeCheckoutTotals` the real charge does, so the quote
 * and the charge cannot disagree.
 *
 * Answers 200 with `null` for a selection it can't price yet (no box
 * chosen, an unknown station) rather than an error — a customer
 * half-way through a form is expected, not exceptional.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { packageId, quantity, deliveryMethod, serviceLevel, pickupStationId, referralCode, phone } =
    (body ?? {}) as Record<string, unknown>;

  if (typeof packageId !== 'string' || !packageId || typeof quantity !== 'number') {
    return Response.json({ error: 'packageId and quantity are required' }, { status: 400 });
  }
  if (deliveryMethod !== 'pickup' && deliveryMethod !== 'door') {
    return Response.json({ error: "deliveryMethod must be 'pickup' or 'door'" }, { status: 400 });
  }

  // Same server-verified source as the real charge (§ Creator-Only
  // Offers) — the quote has to show the discount the charge will
  // actually apply, or a customer sees one number and pays another.
  const creatorSession = await verifyCreatorSessionFromRequest(request);

  const quote: WebCheckoutQuote | null = await conversationService.quoteWebCheckout(
    getCurrentBusinessId(),
    {
      packageId,
      quantity,
      deliveryMethod,
      // Without this the quote prices next-day while the order charges
      // same-day — the divergence this endpoint exists to prevent.
      serviceLevel: serviceLevel === 'same-day' ? 'same-day' : undefined,
      pickupStationId: typeof pickupStationId === 'string' ? pickupStationId : undefined,
      referralCode:
        typeof referralCode === 'string' && referralCode.trim() ? referralCode.trim() : undefined,
      phone: typeof phone === 'string' ? phone : undefined,
      isCreatorCheckout: Boolean(creatorSession),
      creatorUid: creatorSession?.uid ?? null,
    },
  );

  return Response.json(quote, { headers: { 'cache-control': 'no-store' } });
}

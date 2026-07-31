import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationService } from '@/services/conversationService';
import type { CheckoutPayRequest, CheckoutPayResponse } from '@/types/checkout';

/**
 * `POST /checkout/pay` (§ Product Catalog & Checkout Architecture):
 * the wire for a customer's explicit PAY reply or a "Pay Now" quick
 * action inside Whatchimp — never called automatically as a side
 * effect of pricing. Internally this just replays the exact same
 * text-PAY pipeline the WhatsApp conversation already uses
 * (`conversationService.start(..., { text: 'PAY' })`), so the price
 * -unchanged revalidation and STK push both go through the one
 * already-tested path, not a parallel one. Snack Quest OS revalidates
 * pricing before charging; Whatchimp is only ever told the outcome
 * after Daraja has been asked, never before — and per the redesign,
 * Whatchimp still never learns *whether* the payment succeeded here.
 * That's Daraja's callback alone (see `app/api/webhooks/daraja/[businessId]/route.ts`).
 */
export async function POST(request: Request): Promise<Response> {
  const expectedKey = process.env.WHATCHIMP_CHECKOUT_API_KEY;
  const providedKey = request.headers.get('x-checkout-api-key');
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { checkoutSessionId } = (body ?? {}) as Partial<CheckoutPayRequest>;
  if (typeof checkoutSessionId !== 'string' || !checkoutSessionId) {
    return Response.json(
      { error: 'body must include a non-empty string checkoutSessionId' },
      { status: 400 },
    );
  }

  const conversation = await conversationRepository.findById(checkoutSessionId);
  if (!conversation) {
    return Response.json({ error: `checkout session ${checkoutSessionId} not found` }, { status: 404 });
  }

  if (conversation.currentStep !== 'awaiting_customer_payment_confirmation') {
    const response: CheckoutPayResponse = {
      status: 'error',
      message: `Checkout session is not ready for payment (currently at ${conversation.currentStep}).`,
    };
    return Response.json(response);
  }

  const priceBefore = conversation.stateBlob.priceKes ?? 0;
  const feeBefore = conversation.stateBlob.deliveryFeeKes ?? 0;

  const turnResult = await conversationService.start(conversation.businessId, conversation.phoneNumber, {
    text: 'PAY',
  });

  const after = await conversationRepository.findById(checkoutSessionId);

  let response: CheckoutPayResponse;
  if (after?.status === 'awaiting_payment') {
    response = {
      status: 'stk_sent',
      message: turnResult.botReply ?? 'Sending your M-Pesa payment prompt now — check your phone.',
    };
  } else if (
    after &&
    ((after.stateBlob.priceKes ?? 0) !== priceBefore || (after.stateBlob.deliveryFeeKes ?? 0) !== feeBefore)
  ) {
    response = {
      status: 'price_changed',
      message:
        `Pricing changed since checkout started — new total is now KES ${after.stateBlob.priceKes ?? 0} ` +
        `plus KES ${after.stateBlob.deliveryFeeKes ?? 0} delivery. Ask the customer to reply PAY again to confirm.`,
    };
  } else {
    response = {
      status: 'error',
      message: "Couldn't start the M-Pesa payment prompt. Ask the customer to reply PAY to retry.",
    };
  }

  return Response.json(response);
}

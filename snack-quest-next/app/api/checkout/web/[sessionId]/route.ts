import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { paymentService } from '@/services/paymentService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `GET /api/checkout/web/{sessionId}` (§ Website Becomes the Primary
 * Commerce Channel — "the page should automatically detect when
 * payment is complete") — what the payment screen polls while the
 * customer is entering their M-Pesa PIN.
 *
 * Polling rather than a push channel because that is what the payment
 * actually is: Safaricom calls our Daraja webhook, the webhook drives
 * `handlePaymentResult`, and this endpoint reads the result of that.
 *
 * It no longer only *reads*, though (§ payment auto-recovery). Waiting
 * on the callback alone was a single point of failure, and it failed:
 * in production Safaricom confirmed payments succeeded while never
 * delivering one callback, so customers paid and no order was ever
 * created. Once a payment has been outstanding long enough that the
 * callback should have arrived, this asks Safaricom directly and
 * settles it from their answer. Still nothing here charges or
 * re-prices — the only state it can advance is one Safaricom has
 * already decided.
 *
 * The session id is an opaque Firestore document id and the response
 * carries no phone number, address, or payment identifiers, so it is
 * readable by whoever holds the id — the same exposure the WhatsApp
 * bridge's own order-status poll already has.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  const businessId = getCurrentBusinessId();

  try {
    // Best-effort: a customer watching this screen must still get an
    // accurate answer if Safaricom is unreachable or slow, so a failed
    // recovery falls through to reading the state as it stands.
    try {
      const recovered = await paymentService.recoverProcessingPayment(businessId, sessionId);
      if (recovered) {
        await conversationService.handlePaymentResult(recovered);
      }
    } catch {
      // Deliberately swallowed — see above.
    }

    const status = await conversationService.getWebCheckoutStatus(businessId, sessionId);
    return Response.json(status, {
      // A payment result is a moving target for a minute and then
      // permanent; either way a cached copy would defeat the poll.
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: 'checkout session not found' }, { status: 404 });
    }
    throw error;
  }
}

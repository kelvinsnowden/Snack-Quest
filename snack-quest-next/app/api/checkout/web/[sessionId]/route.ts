import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
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
 * Nothing here charges, re-prices, or advances anything — a customer
 * refreshing or leaving this page open changes no state.
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

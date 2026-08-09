import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { conversationService, ConversationNotFoundError } from '@/services/conversationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { PaymentWaiting } from '@/components/checkout/PaymentWaiting';
import { CheckoutSuccess } from '@/components/checkout/CheckoutSuccess';
import type { WebCheckoutStatusResponse } from '@/types/webCheckout';

/**
 * `/checkout/{sessionId}` (§ Website Becomes the Primary Commerce
 * Channel) — the payment screen and, once M-Pesa confirms, the success
 * screen, at one shareable URL.
 *
 * One route rather than two because the transition between them is not
 * a navigation the customer performs: it happens when Safaricom calls
 * our Daraja webhook, seconds after they enter their PIN. The client
 * polls, and on success calls `router.refresh()` — this Server
 * Component re-runs and swaps in the confirmation with no page reload
 * and no flash, which is exactly the "automatically detect when
 * payment is complete" behaviour the spec asks for. Reloading or
 * revisiting the URL later lands directly on whichever state is true
 * now.
 */
export const metadata: Metadata = {
  title: 'Your payment',
  // A live payment state is never something to index or share into a
  // search result.
  robots: { index: false, follow: false },
};

export default async function CheckoutSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const businessId = getCurrentBusinessId();

  let status: WebCheckoutStatusResponse;
  try {
    status = await conversationService.getWebCheckoutStatus(businessId, sessionId);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      {status.paymentStatus === 'succeeded' ? (
        <CheckoutSuccess status={status} />
      ) : (
        <PaymentWaiting sessionId={sessionId} initialStatus={status} />
      )}
    </div>
  );
}

import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

/**
 * Daraja's STK Push callback (PLATFORM_ARCHITECTURE_V2.md §7). The
 * business is part of the URL itself, not resolved from the payload —
 * Safaricom requires each shortcode/app to register its own specific
 * callback URL, so every tenant gets a distinct URL
 * (`.../daraja/{businessId}`) to hand Safaricom at Daraja app
 * registration time. Thin by design otherwise — idempotency,
 * verification, and amount matching all happen in
 * `paymentService.processCallback()`; the domain reaction (what
 * happens to the conversation) happens in
 * `conversationService.handlePaymentResult()`. This route is just the
 * wire — real origin verification (§ Secure the Daraja and Whatchimp
 * webhook routes) happens in `verifyDarajaWebhookRequest`.
 *
 * **Also the only Daraja webhook a vending payment can ever reach**
 * (§ VENDING_OS_BENCHMARK.md §C/§F). `darajaGateway.initiateStkPush`
 * always sends Safaricom to this business's one registered
 * `CallBackURL` — there is no second URL to give a vending push
 * instead, since Safaricom was never told one exists. So this route
 * gains one branch, checked first: does this callback's
 * `checkoutRequestId` belong to a `machineTransactions` record? If
 * so, `machineTransactionService.handleMpesaCallback` owns it
 * completely and the e-commerce path below never runs. If not — the
 * overwhelmingly common case today, since no vending payment has
 * happened yet — everything below is exactly what it was before this
 * branch existed. A payload `darajaGateway.verifyCallback` can't
 * parse at all falls through unchanged too; `paymentService.processCallback`
 * meets the identical parse failure itself, exactly as it always has.
 *
 * Deliberately narrow about *what* falls through: only a parse
 * failure on `verifyCallback` itself does. If parsing succeeds and
 * `machineTransactionService.handleMpesaCallback` then throws — a
 * real infrastructure error, not "this isn't a vending callback" —
 * that error is left to propagate, not swallowed into a silent
 * fallthrough. Recognising a callback as vending's and then quietly
 * misrouting it into the unrelated e-commerce path on an unrelated
 * failure would be worse than a 500: Safaricom retries a 500 (§ "Daraja
 * expects a fast 200… regardless of outcome" describes the *normal*
 * path, not a masked bug), and a swallowed exception here would not
 * just be silent, it would be silently wrong.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<Response> {
  const { businessId: businessIdParam } = await params;
  const verification = await verifyDarajaWebhookRequest(businessIdParam, request);
  if (!verification.ok) {
    return verification.response;
  }
  // The route param may carry the webhook secret; this is the real tenant id.
  const businessId = verification.businessId;

  const payload = await request.json();

  let callback: ReturnType<typeof darajaGateway.verifyCallback> | null = null;
  try {
    callback = darajaGateway.verifyCallback(payload);
  } catch {
    // Not a parseable STK callback at all — fall through to the
    // e-commerce path, which meets the identical parse failure
    // itself and reacts to it exactly as it always has.
  }

  if (callback) {
    // Not wrapped in a try/catch: a throw here means we *did*
    // recognise this as parseable and are actively deciding what to
    // do with it, so a real failure must surface as one, never as a
    // silent slide into the unrelated e-commerce path below.
    const vendingOutcome = await machineTransactionService.handleMpesaCallback(businessId, callback);
    if (vendingOutcome.handled) {
      return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
  }

  const result = await paymentService.processCallback(businessId, payload);
  await conversationService.handlePaymentResult(result);

  // Daraja expects a fast 200 acknowledging receipt regardless of outcome.
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

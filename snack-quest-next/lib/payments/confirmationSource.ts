import type { WebhookEvent } from '@/types';

/**
 * How a payment came to be confirmed (§ was the callback ever
 * received).
 *
 * An order existing does not prove Safaricom's callback works. There
 * are two roads to a confirmed payment and they look identical from
 * the outside:
 *
 * - Safaricom POSTs the callback to `CallBackURL` and the order is
 *   created from it.
 * - The callback never arrives, and the recovery sweep asks Safaricom
 *   what happened to the STK push — `queryStkStatus` — and settles the
 *   payment from the answer.
 *
 * The second is a safety net, and it working is exactly what hides the
 * first being broken. A shop can take money for weeks on nothing but
 * the net and never know, until the day the sweep is the thing that
 * fails.
 *
 * They are already distinguishable in the data and nothing read it:
 * the recovery path stamps `source: 'stk_push_query_recovery'` onto
 * the `webhookEvents` payload it writes, while a real callback stores
 * Safaricom's own body verbatim.
 */
export type PaymentConfirmationSource =
  /** Safaricom posted the callback. The integration is working end to end. */
  | 'callback'
  /** No callback arrived; this system asked Safaricom and settled it. */
  | 'recovery_query'
  /** Money asserted by a human — cash, bank transfer, a customer-sent M-Pesa code. */
  | 'manual'
  /** No attempt or no record — a payment that never reached Safaricom at all. */
  | 'unknown';

export function confirmationSourceOf(event: WebhookEvent | null): PaymentConfirmationSource {
  if (!event) {
    return 'unknown';
  }
  /*
   * Read off the payload rather than a dedicated field, because that
   * is where the distinction already lives — and adding a field now
   * would leave every existing event unclassifiable, which is
   * precisely the history worth being able to read.
   */
  return event.payload?.source === 'stk_push_query_recovery' ? 'recovery_query' : 'callback';
}

export const CONFIRMATION_SOURCE_LABELS: Record<PaymentConfirmationSource, string> = {
  callback: 'Confirmed by Safaricom’s callback',
  recovery_query: 'Recovered by asking Safaricom — no callback arrived',
  manual: 'Recorded by hand',
  unknown: 'No Safaricom record',
};

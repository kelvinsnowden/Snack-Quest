/**
 * How long a started M-Pesa prompt is treated as still answerable.
 *
 * Shared deliberately between the waiting screen and the server-side
 * checkout guard, because the bug this constant exists to prevent was
 * the two of them disagreeing. The waiting screen gave up after four
 * minutes and told the customer "you can start again"; the server went
 * on refusing a second checkout for as long as the conversation sat in
 * `awaiting_payment`, which — when no Daraja callback ever arrives —
 * is forever. The customer was invited to retry and then blocked from
 * retrying, with no way out.
 *
 * The server's guard exists for a real reason (a second checkout
 * against a not-yet-debited wallet balance would apply one balance as
 * a discount twice), so the answer is not to remove it but to bound
 * it. Anything shorter than Safaricom's own prompt lifetime would
 * reopen that race while the first prompt is genuinely still on the
 * customer's screen; anything longer strands the customer again.
 *
 * Comfortably past Safaricom's STK expiry (~2 minutes) plus callback
 * delivery time.
 */
export const STK_ATTEMPT_ABANDON_AFTER_MS = 4 * 60 * 1000;

/** Whole seconds still to wait before a fresh attempt is allowed. Zero once the window has passed. */
export function stkRetryWaitSeconds(startedAtMs: number, now = Date.now()): number {
  const remainingMs = startedAtMs + STK_ATTEMPT_ABANDON_AFTER_MS - now;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

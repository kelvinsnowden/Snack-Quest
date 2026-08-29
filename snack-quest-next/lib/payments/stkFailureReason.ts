/**
 * What to tell a customer whose M-Pesa payment did not go through
 * (§ accurate payment failure feedback).
 *
 * The failure screen used to hedge across every cause at once: "the
 * prompt may not have reached your phone, or it was cancelled before
 * you entered your PIN". Both halves are wrong most of the time, and
 * the customer is left without the one thing that would help — what to
 * do differently on the next try. Someone whose phone was off needs to
 * turn it on; someone who cancelled needs to not cancel; someone with
 * KES 200 in their wallet needs to top up. One sentence cannot serve
 * all three.
 *
 * Safaricom already says which it was. Every STK callback carries a
 * `ResultCode` and a `ResultDesc`, both stored on the attempt since
 * before this existed and neither ever shown to anybody.
 *
 * The governing rule here is that an unrecognised code produces no
 * explanation at all. `classifyStkFailure` returns null rather than a
 * plausible-sounding guess, and the screen falls back to saying only
 * what is certain: it did not go through, and nothing was charged.
 * Inventing a cause is worse than admitting to none, because a
 * customer who is told the wrong thing acts on it — retrying against a
 * problem they do not have, or topping up a wallet that was never
 * short.
 */

export type StkFailureCategory =
  | 'cancelled'
  | 'unreachable'
  | 'no_response'
  | 'insufficient_funds'
  | 'wrong_pin'
  | 'expired'
  | 'busy'
  | 'system';

export interface StkFailureReason {
  category: StkFailureCategory;
  /** One sentence naming what happened, in the customer's terms. */
  message: string;
  /** What to do differently. Null when there is genuinely nothing to suggest beyond trying again. */
  nextStep: string | null;
}

/**
 * Whether the customer could plausibly succeed by simply retrying as
 * they are. False for the cases that need something to change first —
 * money in the wallet, a phone that is switched on.
 */
export function isRetryableWithoutChange(category: StkFailureCategory): boolean {
  return category === 'cancelled' || category === 'busy' || category === 'system';
}

/**
 * Safaricom's result code, turned into something a customer can act on.
 *
 * Returns null for any code not listed. That is the point: the set
 * below is the codes whose meaning is actually known, and everything
 * else deliberately falls through to the caller's honest fallback
 * rather than being guessed at.
 */
export function classifyStkFailure(
  resultCode: number | null | undefined,
  resultDesc?: string | null,
): StkFailureReason | null {
  switch (resultCode) {
    case 1032:
      return {
        category: 'cancelled',
        message: 'The M-Pesa prompt was cancelled before the PIN was entered.',
        nextStep: 'Try again and choose to accept the prompt when it appears.',
      };

    /*
     * 1037 is two different real-world events sharing one code, which
     * is exactly the distinction a single hedged sentence loses.
     * Production has both: "DS timeout user cannot be reached." means
     * the push never got to the handset, and "No response from user."
     * means it arrived and nobody answered. The customer's next step
     * differs completely, so the description decides.
     */
    case 1037:
      return classify1037(resultDesc);

    case 1:
      return {
        category: 'insufficient_funds',
        message: 'There was not enough money in the M-Pesa wallet to complete the payment.',
        nextStep: 'Top up and try again.',
      };

    case 2001:
      return {
        category: 'wrong_pin',
        message: 'The M-Pesa PIN entered was not correct.',
        nextStep: 'Try again and re-enter your PIN carefully.',
      };

    case 1019:
      return {
        category: 'expired',
        message: 'The M-Pesa prompt expired before it was completed.',
        nextStep: 'Try again and enter your PIN as soon as the prompt appears.',
      };

    case 1001:
      return {
        category: 'busy',
        message: 'Another M-Pesa transaction was still in progress on this number.',
        nextStep: 'Wait a moment for it to finish, then try again.',
      };

    /*
     * Safaricom's own end, not the customer's. Worth saying plainly:
     * someone who is told nothing assumes they did something wrong and
     * often does not come back.
     */
    case 1025:
    case 9999:
      return {
        category: 'system',
        message: 'M-Pesa could not process the request just then.',
        nextStep: 'This one is on the payment network, not you. Trying again usually works.',
      };

    default:
      // Deliberately no guess. See this module's own comment.
      return null;
  }
}

function classify1037(resultDesc?: string | null): StkFailureReason {
  const desc = (resultDesc ?? '').toLowerCase();

  if (desc.includes('cannot be reached') || desc.includes('unable to reach')) {
    return {
      category: 'unreachable',
      message: 'The M-Pesa prompt could not reach your phone.',
      nextStep: 'Check the phone is switched on and has network, then try again.',
    };
  }

  if (desc.includes('no response')) {
    return {
      category: 'no_response',
      message: 'The M-Pesa prompt reached your phone but was not answered in time.',
      nextStep: 'Try again and enter your PIN as soon as the prompt appears.',
    };
  }

  /*
   * A 1037 whose wording is neither of the two seen in production. The
   * code itself still reliably means the prompt timed out, so that much
   * is safe to say; which side it timed out on is not, and is left
   * unsaid rather than picked.
   */
  return {
    category: 'no_response',
    message: 'The M-Pesa prompt timed out before the payment was completed.',
    nextStep: 'Try again and enter your PIN as soon as the prompt appears.',
  };
}

/**
 * B2C failure classification (§ Daraja B2C production readiness) — the
 * audit's central finding was that every non-zero B2C `Result.ResultCode`
 * (and every synchronous gateway rejection) was treated identically:
 * refund the balance, mark `'failed'`, done. That collapses a
 * credential/configuration error (which will fail identically forever
 * until an operator fixes it) into the same bucket as a recipient
 * temporarily over their M-Pesa wallet cap (which will very likely
 * succeed on a later attempt with no code change at all).
 *
 * Categories, and what `WithdrawalService` does with each:
 * - `permanent_configuration`: will fail identically on every retry.
 *   Refund once, mark failed, and auto-freeze the `b2c_disbursements_frozen`
 *   feature flag for the business so no admin can approve *any* further
 *   withdrawal into the same wall before an operator fixes the underlying
 *   credential/config problem and manually clears the flag.
 * - `account_funding`: the business's own B2C-side account (Utility
 *   Account balance, daily transfer limit) is the problem, not this
 *   specific transaction. Refund once, alert urgently — but don't freeze
 *   disbursements platform-wide, since a differently-timed/sized request
 *   (or the same one, once funded) can legitimately still succeed.
 * - `recipient`: the creator's own M-Pesa account is the constraint
 *   (e.g. would exceed their wallet balance cap). Refund once, tell the
 *   creator why — routine, not an admin emergency.
 * - `retryable`: a transient/gateway-level condition. Refund once
 *   (this codebase never auto-retries a B2C request, per the explicit
 *   "never blindly retry an ambiguous payment" rule) — a human can
 *   choose to approve a fresh withdrawal request.
 * - `ambiguous`: Safaricom's own response doesn't map cleanly to any of
 *   the above (including "duplicate transaction" — which deserves an
 *   alert on its own, since it may be evidence of a bug elsewhere, not
 *   just Safaricom being cautious). Refund once, alert, never guess.
 */

export type B2CFailureCategory =
  | 'permanent_configuration'
  | 'account_funding'
  | 'recipient'
  | 'retryable'
  | 'ambiguous';

export interface B2CFailureClassification {
  category: B2CFailureCategory;
  /** Human-readable reason, safe to show an admin — never includes any credential material. */
  explanation: string;
}

const RESULT_CODE_CATEGORIES: Record<number, B2CFailureCategory> = {
  1: 'account_funding', // Insufficient balance in the organization's own account
  2: 'permanent_configuration', // Less than minimum transaction value — a validation gap on our side if it ever reaches Safaricom
  3: 'permanent_configuration', // More than maximum transaction value — same reasoning
  4: 'account_funding', // Would exceed the organization's daily transfer limit
  8: 'ambiguous', // Timeout reported inside a Result payload (distinct from the QueueTimeOutURL path, which is handled the same as a failure already)
  11: 'permanent_configuration', // Debit account invalid
  21: 'recipient', // Would exceed the recipient's maximum M-Pesa balance
  2001: 'permanent_configuration', // Invalid Initiator Information
  2006: 'account_funding', // Insufficient funds in the B2C Utility Account specifically
  2028: 'permanent_configuration', // Invalid Amount
  2040: 'ambiguous', // Duplicate/similar transaction already processed — investigate, don't just shrug
  8006: 'retryable', // Gateway/system-level error family
};

/** Classifies a definitive async `Result.ResultCode` (never called for `ResultCode === 0` — that's success, not a failure to classify). */
export function classifyB2CResultCode(
  resultCode: number,
): B2CFailureClassification {
  const category = RESULT_CODE_CATEGORIES[resultCode] ?? 'ambiguous';
  return { category, explanation: `Daraja ResultCode ${resultCode}` };
}

/**
 * Best-effort classification of a *synchronous* gateway rejection —
 * these arrive as a thrown `Error` with Safaricom's `errorMessage`/
 * `ResponseDescription` text, not a structured `ResultCode`, because
 * the request never even reached Safaricom's async processing (a bad
 * credential, a malformed request, an expired access token). Pattern-
 * matched on known substrings; genuinely unrecognized text is
 * `'ambiguous'`, never assumed safe to retry.
 */
export function classifyB2CGatewayError(
  message: string,
): B2CFailureClassification {
  const normalized = message.toLowerCase();

  // Safaricom's own initiator/credential error code, and the plain-text
  // variants seen in ResponseDescription for the same underlying fault.
  if (
    normalized.includes('sfc_ic0003') ||
    normalized.includes('invalid initiator') ||
    normalized.includes('invalid security credential') ||
    normalized.includes('invalid securitycredential')
  ) {
    return {
      category: 'permanent_configuration',
      explanation: 'Invalid initiator/security credential',
    };
  }
  if (normalized.includes('invalid amount')) {
    return {
      category: 'permanent_configuration',
      explanation: 'Invalid amount',
    };
  }
  if (
    normalized.includes('insufficient balance') ||
    normalized.includes('insufficient funds')
  ) {
    return {
      category: 'account_funding',
      explanation: 'Insufficient funds in the organization/B2C Utility Account',
    };
  }
  if (normalized.includes('duplicate')) {
    return {
      category: 'ambiguous',
      explanation: 'Safaricom reports a duplicate/similar transaction',
    };
  }
  if (
    normalized.includes('invalid access token') ||
    normalized.includes('token')
  ) {
    // Self-recovering — the next call fetches a fresh token — but still
    // never auto-retried by this codebase; a human clicking Approve
    // again is what "retryable" means here.
    return { category: 'retryable', explanation: 'Access token rejected' };
  }

  return { category: 'ambiguous', explanation: message };
}

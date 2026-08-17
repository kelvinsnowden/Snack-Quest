/**
 * The smallest amount a creator can request in a single withdrawal
 * (§ Creator Portal withdrawals). Set to exactly one referral
 * commission (`CREATOR_COMMISSION_KES`, lib/creators/referralEconomics.ts)
 * on purpose: campaign rewards alone top out at KES 250, so a creator
 * who has only ever earned from campaigns can't cash out — they have
 * to convert one real referral sale first. Enforced in
 * `WithdrawalService.requestWithdrawal`, not in Firestore Security
 * Rules, the same layer every other withdrawal business rule
 * (balance reservation, creator eligibility) already lives in.
 *
 * Already comfortably above Safaricom's own documented B2C minimum
 * (KES 10) — no separate check against that figure is needed.
 */
export const MIN_WITHDRAWAL_KES = 300;

/**
 * Safaricom's documented B2C per-transaction ceiling (§ Daraja B2C
 * production readiness) — a request above this is guaranteed to be
 * rejected by Daraja, so it's validated here first rather than wasting
 * a real API round-trip (and, worse, a reserved balance sitting
 * against a request that can never succeed) to discover that.
 *
 * Two other limits Safaricom documents — the recipient's own M-Pesa
 * wallet balance cap (KES 500,000) and the organization's daily B2C
 * transfer value cap (also KES 500,000) — are deliberately NOT
 * enforced here: this codebase has no way to know a creator's current
 * M-Pesa wallet balance (that's Safaricom's own data), and a
 * meaningful daily-cumulative tracker is a real feature in its own
 * right, not a one-line constant. Both surface today as a classified
 * `account_funding` (daily limit) or `recipient` (wallet cap) B2C
 * ResultCode instead — see `lib/integrations/daraja/b2cResultCodes.ts`
 * — refunded and reported like any other classified failure, not
 * silently mishandled.
 */
export const MAX_WITHDRAWAL_KES = 250_000;
